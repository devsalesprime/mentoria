import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { UploadedFile } from '../../types/audio';
import { Button } from '../ui/Button';

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  category: string;
  token: string;
  maxFiles?: number;
  allowUrls?: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_BATCH = 10;

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-',
  'text/plain',
];

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.cmd', '.ps1', '.msi', '.com', '.scr'];

function isAllowedFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return `Tipo de arquivo "${ext}" não é permitido.`;
  }
  const mimeOk = ALLOWED_MIME_PREFIXES.some(prefix => file.type.startsWith(prefix));
  if (!mimeOk && file.type) {
    return `Tipo de arquivo "${file.type}" não é suportado. Permitido: imagens, PDFs, documentos, apresentações, planilhas.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `O arquivo "${file.name}" excede o limite de 50MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
  }
  return null;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

export const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  category,
  token,
  maxFiles = MAX_BATCH,
  allowUrls = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (fileList: File[]) => {
    setErrors([]);
    const remaining = maxFiles - files.length;
    if (fileList.length > remaining) {
      setErrors([`Você pode enviar apenas mais ${remaining} arquivo(s) (máximo de ${maxFiles} no total).`]);
      return;
    }

    const validationErrors: string[] = [];
    const validFiles: File[] = [];
    for (const file of fileList) {
      const err = isAllowedFile(file);
      if (err) validationErrors.push(err);
      else validFiles.push(file);
    }

    if (validationErrors.length) {
      setErrors(validationErrors);
      if (!validFiles.length) return;
    }

    setUploading(true);
    const newFiles: UploadedFile[] = [];

    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        const res = await axios.post('/api/files/upload', formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        });
        newFiles.push(res.data.data);
      } catch (err: any) {
        validationErrors.push(`Falha ao enviar "${file.name}": ${err.message}`);
      }
    }

    if (validationErrors.length) setErrors(validationErrors);
    if (newFiles.length) onFilesChange([...files, ...newFiles]);
    setUploading(false);
  }, [files, onFilesChange, category, token, maxFiles]);

  const deleteFile = useCallback(async (fileId: string) => {
    try {
      await axios.delete(`/api/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });
      onFilesChange(files.filter(f => f.id !== fileId));
    } catch (err: any) {
      setErrors([`Falha ao remover arquivo: ${err.message}`]);
    }
  }, [files, onFilesChange, token]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) uploadFiles(dropped);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) uploadFiles(selected);
    e.target.value = '';
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <motion.div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
            : 'border-white/20 bg-prosperus-navy-mid hover:border-white/30'
        }`}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <span className="text-2xl">📁</span>
        <p className="text-sm text-white/60 font-sans text-center">
          {uploading ? 'Enviando...' : 'Arraste arquivos aqui ou clique para selecionar'}
        </p>
        <p className="text-xs text-white/50 font-sans">
          Máx. 50MB por arquivo · {maxFiles} arquivos · Imagens, PDFs, documentos
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleInputChange}
          className="hidden"
        />
      </motion.div>

      {/* Errors */}
      <AnimatePresence>
        {errors.map((err, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-400 font-sans"
          >
            {err}
          </motion.p>
        ))}
      </AnimatePresence>

      {/* File list */}
      <AnimatePresence>
        {files.map(file => (
          <motion.div
            key={file.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex items-center justify-between gap-3 p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white/50">📄</span>
              <span className="text-sm text-white/70 font-sans truncate">{file.fileName}</span>
              {file.fileSize != null && (
                <span className="text-xs text-white/50 font-sans flex-shrink-0">{formatSize(file.fileSize)}</span>
              )}
            </div>
            <Button
              variant="icon"
              size="xs"
              type="button"
              onClick={() => deleteFile(file.id)}
              className="!text-white/50 hover:!text-red-400 flex-shrink-0"
              aria-label={`Remover ${file.fileName}`}
            >
              ✕
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
