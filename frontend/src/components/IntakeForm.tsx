import { useState, useRef } from 'react';
import { fileToAttachment } from '../services/api';
import type { Attachment } from '../types';

interface IntakeFormProps {
  initialDescription?: string;
  initialAttachments?: Attachment[];
  onSubmit: (description: string, attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function IntakeForm({
  initialDescription = '',
  initialAttachments = [],
  onSubmit,
  disabled = false,
}: IntakeFormProps) {
  const [description, setDescription] = useState(initialDescription);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [fileNames, setFileNames] = useState<string[]>(
    initialAttachments.map(a => a.filename)
  );
  const [processingFiles, setProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedLen = description.trim().length;
  const isValid = trimmedLen >= 10;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessingFiles(true);

    try {
      const newAttachments: Attachment[] = [];
      const newNames: string[] = [];

      for (const file of Array.from(files)) {
        const att = await fileToAttachment(file);
        newAttachments.push(att);
        newNames.push(file.name);
      }

      setAttachments(prev => [...prev, ...newAttachments]);
      setFileNames(prev => [...prev, ...newNames]);
    } finally {
      setProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setFileNames(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !disabled) {
      onSubmit(description.trim(), attachments);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="intake-form">
      <h2>Describe tu problema o consulta</h2>
      <p className="form-hint">
        Explica con tus palabras qué te ocurre o qué necesitas.
        No hace falta que clasifiques nada, nosotros nos encargamos.
      </p>

      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Ej: No me deja generar factura, da error al guardar el pedido..."
        rows={6}
        disabled={disabled}
        autoFocus
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {trimmedLen > 0 && trimmedLen < 10 ? (
          <p className="form-error">Necesitamos al menos 10 caracteres.</p>
        ) : (
          <span />
        )}
        <span className="char-count">{trimmedLen} caracteres</span>
      </div>

      <div className="attachments-section">
        <label className="file-label">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={e => handleFiles(e.target.files)}
            disabled={disabled || processingFiles}
          />
          {processingFiles ? 'Procesando...' : 'Adjuntar archivos'}
        </label>

        {fileNames.length > 0 && (
          <ul className="file-list">
            {fileNames.map((name, i) => (
              <li key={i}>
                {name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  disabled={disabled}
                  className="remove-file"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={!isValid || disabled} className="btn-primary">
        Continuar
      </button>
    </form>
  );
}
