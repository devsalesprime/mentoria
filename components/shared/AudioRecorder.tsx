import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { AudioSegment, SavedAudioSegment } from '../../types/audio';
import { Button } from '../ui/Button';

interface AudioRecorderProps {
  maxDuration: number; // seconds
  onTranscriptReady?: (transcript: string) => void;
  onAudioSaved?: (audioId: string) => void;
  questionId: string;
  token: string;
  module?: string;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  maxDuration,
  onTranscriptReady,
  onAudioSaved,
  questionId,
  token,
  module = 'general',
}) => {
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [savedSegments, setSavedSegments] = useState<SavedAudioSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(maxDuration);
  const [isSupported, setIsSupported] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playQueueRef = useRef<AudioSegment[]>([]);
  // Maps local segment IDs to server IDs after upload
  const uploadedIdsRef = useRef<Map<string, string>>(new Map());

  // Check browser support
  useEffect(() => {
    if (typeof window !== 'undefined' && (!navigator.mediaDevices || !window.MediaRecorder)) {
      setIsSupported(false);
    }
  }, []);

  // Fetch saved recordings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSaved(true);
        const res = await axios.get('/api/audio/list', {
          params: { module, questionId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.data.success) {
          setSavedSegments(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch saved recordings:', err);
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();
    return () => { cancelled = true; };
  }, [module, questionId, token]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = elapsedBeforePauseRef.current + (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, maxDuration - elapsed);
      setCurrentTime(remaining);
      if (remaining <= 0) {
        stopRecording();
      }
    }, 100);
  }, [maxDuration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const elapsed = elapsedBeforePauseRef.current + (Date.now() - startTimeRef.current) / 1000;
          const segment: AudioSegment = {
            id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            blob,
            duration: Math.round(elapsed),
            createdAt: new Date().toISOString(),
          };
          setSegments(prev => [...prev, segment]);
          uploadSegment(segment);
        }
      };

      mediaRecorderRef.current = recorder;
      elapsedBeforePauseRef.current = 0;
      setCurrentTime(maxDuration);
      recorder.start(250); // collect data every 250ms
      setIsRecording(true);
      setIsPaused(false);
      startTimer();
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [maxDuration, startTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      elapsedBeforePauseRef.current += (Date.now() - startTimeRef.current) / 1000;
      stopTimer();
      setIsPaused(true);
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      startTimer();
      setIsPaused(false);
    }
  }, [startTimer]);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    setCurrentTime(maxDuration);
    elapsedBeforePauseRef.current = 0;
  }, [stopTimer, maxDuration]);

  const uploadSegment = useCallback(async (segment: AudioSegment) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', segment.blob, `${questionId}_${Date.now()}.webm`);
      formData.append('module', module);
      formData.append('questionId', questionId);
      formData.append('durationSeconds', String(segment.duration));
      const res = await axios.post('/api/audio/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });
      const serverId = res.data.data.id;
      uploadedIdsRef.current.set(segment.id, serverId);
      onAudioSaved?.(serverId);
    } catch (err) {
      console.error('Failed to upload audio segment:', err);
    } finally {
      setUploading(false);
    }
  }, [questionId, token, module, onAudioSaved]);

  const playSavedSegment = useCallback((saved: SavedAudioSegment) => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    }
    const url = `/api/audio/${saved.serverId}?token=${encodeURIComponent(token)}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(saved.serverId);
    audio.onended = () => {
      setPlayingId(null);
    };
    audio.onerror = () => {
      console.error('Failed to play saved audio');
      setPlayingId(null);
    };
    audio.play();
  }, [token]);

  const playSegment = useCallback((segment: AudioSegment) => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    }
    const url = URL.createObjectURL(segment.blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(segment.id);
    audio.onended = () => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
      // If playing all, play next in queue
      if (playQueueRef.current.length > 0) {
        const next = playQueueRef.current.shift()!;
        playSegment(next);
      }
    };
    audio.play();
  }, []);

  const playAll = useCallback(() => {
    if (segments.length === 0) return;
    playQueueRef.current = segments.slice(1);
    playSegment(segments[0]);
  }, [segments, playSegment]);

  const stopPlayback = useCallback(() => {
    playQueueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const deleteSegment = useCallback((segmentId: string) => {
    if (playingId === segmentId) stopPlayback();
    setSegments(prev => prev.filter(s => s.id !== segmentId));
    // Also delete from server if it was already uploaded
    const serverId = uploadedIdsRef.current.get(segmentId);
    if (serverId) {
      uploadedIdsRef.current.delete(segmentId);
      axios.delete(`/api/audio/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.error('Failed to delete uploaded segment from server:', err));
    }
  }, [playingId, stopPlayback, token]);

  const deleteSavedSegment = useCallback(async (serverId: string) => {
    if (playingId === serverId) stopPlayback();
    setDeletingId(serverId);
    try {
      await axios.delete(`/api/audio/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSavedSegments(prev => prev.filter(s => s.serverId !== serverId));
    } catch (err) {
      console.error('Failed to delete saved audio:', err);
    } finally {
      setDeletingId(null);
    }
  }, [token, playingId, stopPlayback]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-prosperus-navy-mid border border-white/10 rounded-lg">
        <p className="text-sm text-white/60 font-sans">
          Your browser does not support audio recording. Please use text input instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Saved recordings from server (previous sessions) */}
      {loadingSaved ? (
        <div className="p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg">
          <span className="text-xs text-white/50 font-sans">Loading saved recordings...</span>
        </div>
      ) : savedSegments.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-white/50 font-sans uppercase tracking-wider">Saved Recordings</span>
          <AnimatePresence>
            {savedSegments.map((saved, i) => (
              <motion.div
                key={saved.serverId}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`flex flex-col gap-1 p-3 rounded-lg border transition-colors ${
                  playingId === saved.serverId
                    ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/30'
                    : 'bg-prosperus-navy-mid border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 font-mono w-5">{i + 1}</span>
                  <Button
                    variant="icon"
                    size="xs"
                    type="button"
                    onClick={() => playingId === saved.serverId ? stopPlayback() : playSavedSegment(saved)}
                    className="!text-white/60 hover:!text-white"
                    aria-label={playingId === saved.serverId ? 'Stop' : 'Play'}
                  >
                    {playingId === saved.serverId ? '⏹' : '▶'}
                  </Button>
                  <span className="text-sm text-white/50 font-sans">{formatTime(saved.duration)}</span>
                  <div className="flex-1" />
                  <Button
                    variant="icon"
                    size="xs"
                    type="button"
                    onClick={() => deleteSavedSegment(saved.serverId)}
                    disabled={deletingId === saved.serverId}
                    className="!text-white/50 hover:!text-red-400"
                    aria-label={`Delete saved segment ${i + 1}`}
                  >
                    {deletingId === saved.serverId ? '...' : '🗑'}
                  </Button>
                </div>
                {saved.transcript && (
                  <p className="text-sm text-white/50 font-sans ml-8 mt-1 italic leading-relaxed">
                    {saved.transcript}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Recording controls */}
      <div className="flex items-center gap-3 p-4 bg-prosperus-navy-mid border border-white/10 rounded-lg">
        {!isRecording ? (
          <Button
            variant="danger"
            type="button"
            onClick={startRecording}
            className="!bg-red-600/80 hover:!bg-red-600"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            Record
          </Button>
        ) : (
          <>
            {!isPaused ? (
              <Button
                variant="secondary"
                type="button"
                onClick={pauseRecording}
                className="!bg-yellow-600/80 hover:!bg-yellow-600 !text-white !border-none"
              >
                ⏸ Pause
              </Button>
            ) : (
              <Button
                variant="success"
                type="button"
                onClick={resumeRecording}
                className="!bg-green-600/80 hover:!bg-green-600"
              >
                ▶ Resume
              </Button>
            )}
            <Button
              variant="secondary"
              type="button"
              onClick={stopRecording}
            >
              ⏹ Stop
            </Button>
          </>
        )}

        {/* Timer */}
        {isRecording && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 ml-auto"
          >
            <motion.span
              animate={{ opacity: isPaused ? 0.5 : [1, 0.3, 1] }}
              transition={isPaused ? {} : { duration: 1, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-red-500"
            />
            <span className={`text-sm font-mono ${currentTime < 10 ? 'text-red-400' : 'text-white/70'}`}>
              {formatTime(currentTime)}
            </span>
          </motion.div>
        )}

        {/* Play All */}
        {!isRecording && segments.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={playingId ? stopPlayback : playAll}
            className="ml-auto !bg-prosperus-gold-dark/20 hover:!bg-prosperus-gold-dark/30 !text-prosperus-gold-light !border-prosperus-gold-dark/30"
          >
            {playingId ? '⏹ Stop All' : '▶ Play All'}
          </Button>
        )}

        {uploading && (
          <span className="text-xs text-white/50 font-sans ml-2">Uploading...</span>
        )}
      </div>

      {/* Local segments list — accumulated during this session */}
      <AnimatePresence>
        {segments.map((segment, i) => (
          <motion.div
            key={segment.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              playingId === segment.id
                ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/30'
                : 'bg-prosperus-navy-mid border-white/10'
            }`}
          >
            <span className="text-xs text-white/50 font-mono w-5">{i + 1}</span>
            <Button
              variant="icon"
              size="xs"
              type="button"
              onClick={() => playingId === segment.id ? stopPlayback() : playSegment(segment)}
              className="!text-white/60 hover:!text-white"
              aria-label={playingId === segment.id ? 'Stop' : 'Play'}
            >
              {playingId === segment.id ? '⏹' : '▶'}
            </Button>
            <span className="text-sm text-white/50 font-sans">{formatTime(segment.duration)}</span>
            <div className="flex-1" />
            <Button
              variant="icon"
              size="xs"
              type="button"
              onClick={() => deleteSegment(segment.id)}
              className="!text-white/50 hover:!text-red-400"
              aria-label={`Delete segment ${i + 1}`}
            >
              🗑
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
