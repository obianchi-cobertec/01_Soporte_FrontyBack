import { useState, useRef, useEffect } from 'react';
import type { Attachment, AttachmentItem } from '../types';
import {
  isExecutableExtension,
  generatePasteFilename,
  formatBytes,
  getExtension,
  SAFE_LIMIT_BYTES,
} from '../utils/attachments';

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
  const [attachments, setAttachments] = useState<AttachmentItem[]>(() =>
    initialAttachments.map(a => ({
      id: crypto.randomUUID(),
      filename: a.filename,
      mime_type: a.content_type,
      data_base64: a.data,
      // Estimación de tamaño desde base64 (aproximado)
      size_bytes: Math.round((a.data.length * 3) / 4),
      preview_url: null,
      source: 'file' as const,
    }))
  );
  const [processingFiles, setProcessingFiles] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedLen = description.trim().length;
  const isValid = trimmedLen >= 10;

  const totalBytes = attachments.reduce((sum, a) => sum + a.size_bytes, 0);
  const usagePct = totalBytes / (25 * 1024 * 1024);
  const counterClass = usagePct >= 0.9 ? 'over' : usagePct >= 0.6 ? 'warn' : 'ok';

  // Revocar object URLs al desmontar para evitar memory leaks
  useEffect(() => {
    return () => {
      // Captura el array en el momento del cleanup
      setAttachments(prev => {
        prev.forEach(a => {
          if (a.preview_url) URL.revokeObjectURL(a.preview_url);
        });
        return prev;
      });
    };
  }, []);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(',')[1];
        resolve(b64);
      };
      reader.onerror = () => reject(new Error(`Error leyendo: ${file.name}`));
      reader.readAsDataURL(file);
    });

  const addAttachment = async (
    file: File,
    source: 'file' | 'paste',
    filename: string
  ): Promise<void> => {
    // Validar extensión
    if (isExecutableExtension(filename)) {
      setAttachError(
        `No se permiten archivos ejecutables por seguridad. Archivo rechazado: ${filename}`
      );
      return;
    }

    // Validar tamaño total
    const currentTotal = attachments.reduce((sum, a) => sum + a.size_bytes, 0);
    if (currentTotal + file.size > SAFE_LIMIT_BYTES) {
      setAttachError(
        'Has superado el límite de 25 MB en adjuntos. Elimina alguno antes de añadir más.'
      );
      return;
    }

    setAttachError(null);

    try {
      const data_base64 = await fileToBase64(file);
      const preview_url = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;

      const item: AttachmentItem = {
        id: crypto.randomUUID(),
        filename,
        mime_type: file.type || 'application/octet-stream',
        data_base64,
        size_bytes: file.size,
        preview_url,
        source,
      };

      setAttachments(prev => [...prev, item]);
    } catch {
      setAttachError(`No se pudo procesar el archivo: ${filename}`);
    }
  };

  const removeAttachment = (id: string): void => {
    setAttachments(prev => {
      const item = prev.find(a => a.id === id);
      if (item?.preview_url) URL.revokeObjectURL(item.preview_url);
      return prev.filter(a => a.id !== id);
    });
  };

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setProcessingFiles(true);
    try {
      for (const file of Array.from(files)) {
        await addAttachment(file, 'file', file.name);
      }
    } finally {
      setProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>
  ): Promise<void> => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(
      item => item.kind === 'file' && item.type.startsWith('image/')
    );
    // Si no hay imágenes, dejar pasar el paste de texto sin interferir
    if (imageItems.length === 0) return;

    e.preventDefault();
    setProcessingFiles(true);

    const existingNames = new Set(attachments.map(a => a.filename));
    try {
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        const filename = generatePasteFilename(existingNames);
        existingNames.add(filename);
        await addAttachment(file, 'paste', filename);
      }
    } finally {
      setProcessingFiles(false);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || disabled) return;

    // Validación final defensiva
    const total = attachments.reduce((sum, a) => sum + a.size_bytes, 0);
    if (total > SAFE_LIMIT_BYTES) {
      setAttachError(
        'El total de adjuntos supera el límite. Elimina alguno antes de enviar.'
      );
      return;
    }

    // Mapear AttachmentItem[] → Attachment[] (contrato con backend)
    const outAttachments: Attachment[] = attachments.map(a => ({
      filename: a.filename,
      content_type: a.mime_type,
      data: a.data_base64,
    }));

    onSubmit(description.trim(), outAttachments);
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
        onPaste={handlePaste}
        placeholder="Ej: No me deja generar factura, da error al guardar el pedido..."
        rows={6}
        disabled={disabled}
        autoFocus
      />

      <p className="attachment-paste-hint">
        Puedes pegar capturas de pantalla con Ctrl+V o adjuntar archivos desde tu ordenador.
      </p>

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

        {attachError && (
          <p className="attachment-error-msg">{attachError}</p>
        )}

        {attachments.length > 0 && (
          <>
            <div className="attachment-gallery">
              {attachments.map(att => (
                <div key={att.id} className="attachment-thumb">
                  <div className="attachment-thumb-media">
                    {att.preview_url ? (
                      <img src={att.preview_url} alt={att.filename} />
                    ) : (
                      <div className="attachment-thumb-icon">
                        <span>📄</span>
                        <span className="attachment-thumb-ext">
                          {getExtension(att.filename).slice(1) || 'archivo'}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="attachment-thumb-name" title={att.filename}>
                    {att.filename}
                  </p>
                  <p className="attachment-thumb-size">{formatBytes(att.size_bytes)}</p>
                  <button
                    type="button"
                    className="attachment-remove"
                    onClick={() => removeAttachment(att.id)}
                    disabled={disabled}
                    aria-label={`Eliminar ${att.filename}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className={`attachment-counter ${counterClass}`}>
              Adjuntos: {formatBytes(totalBytes)} / 25 MB
            </p>
          </>
        )}
      </div>

      <button
        type="submit"
        disabled={!isValid || disabled}
        className="btn-primary"
      >
        Continuar
      </button>
    </form>
  );
}
