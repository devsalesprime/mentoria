// === AUDIO RECORDING ===
export interface AudioRecording {
  id: string;
  userId: string;
  module: string;
  questionId: string;
  filePath: string;
  transcript?: string;
  durationSeconds?: number;
  createdAt?: string;
}

// === AUDIO SEGMENT (Frontend state) ===
export interface AudioSegment {
  id: string;
  blob: Blob;
  duration: number;
  createdAt: string;
}

// === SAVED AUDIO SEGMENT (Server-loaded recording) ===
export interface SavedAudioSegment {
  serverId: string;
  duration: number;
  transcript?: string;
  createdAt: string;
}

// === UPLOADED FILE ===
export interface UploadedFile {
  id: string;
  userId: string;
  category: string;
  fileName: string;
  filePath: string;
  fileType?: string;
  fileSize?: number;
  url?: string;
  createdAt?: string;
}
