// landr-wwhn.13 — AttachmentsPanel, AttachmentLightbox, AttachmentRow.
// Extracted from TicketDetailSheet.tsx (v9e4.8 refactor — pure file move).
//
// landr-7dya.4 — Full-screen zoomable lightbox for image attachments.
// Pan: click-and-drag. Zoom: scroll wheel / pinch. Keyboard: Esc to close.

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, FileIcon, ImageIcon, Paperclip, XIcon, ZoomInIcon } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/strings'
import { Button } from '@/components/ui/button'

import {
  fetchTicketAttachments,
  getAttachmentSignedUrl,
  uploadTicketAttachment,
  type TicketAttachment,
} from '@/lib/tickets'

// ---- AttachmentsPanel -------------------------------------------------------

type AttachmentsPanelProps = {
  ticketId: string
  publicUserId: string | null
}

export function AttachmentsPanel({ ticketId, publicUserId }: AttachmentsPanelProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: attachments, isPending } = useQuery({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: () => fetchTicketAttachments(ticketId),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadTicketAttachment(ticketId, file, publicUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] })
    },
    onError: (err: Error, file: File) => {
      toast.error(t.ticketDetail.attachmentToastError(file.name), {
        description: err.message,
      })
    },
  })

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file)
    }
  }

  // Clipboard paste handler (image blobs)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) uploadMutation.mutate(file)
        }
      }
    }
    // Listen on the document so the user can paste from anywhere in the panel.
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, publicUserId])

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="ticket-attachments-panel"
    >
      {/* Attachment list */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2 pt-3">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="bg-muted h-10 animate-pulse rounded" />
            ))}
          </div>
        ) : !attachments || attachments.length === 0 ? (
          <p
            className="text-muted-foreground text-sm italic"
            data-testid="ticket-attachments-empty"
          >
            {t.ticketDetail.noAttachments}
          </p>
        ) : (
          attachments.map((a) => (
            <AttachmentRow key={a.id} attachment={a} />
          ))
        )}
      </div>

      {/* Upload controls */}
      <div className="shrink-0 border-t px-4 pb-4 pt-3">
        <p className="text-muted-foreground mb-2 text-xs">
          {t.ticketDetail.attachmentPasteHint}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label={t.ticketDetail.attachmentUploadLabel}
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="attachment-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending || !publicUserId}
          data-testid="attachment-upload-btn"
        >
          <Paperclip className="size-3.5" aria-hidden />
          {uploadMutation.isPending
            ? t.ticketDetail.attachmentUploading
            : t.ticketDetail.attachmentUploadLabel}
        </Button>
      </div>
    </div>
  )
}

// ---- AttachmentLightbox --------------------------------------------------------
//
// landr-7dya.4 — Full-screen zoomable lightbox for image attachments.
// Pan: click-and-drag. Zoom: scroll wheel / pinch. Keyboard: Esc to close.
// The lightbox renders into a portal so it floats above the Sheet z-stack.

type LightboxProps = {
  src: string
  alt: string
  onClose: () => void
}

export function AttachmentLightbox({ src, alt, onClose }: LightboxProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale((s) => Math.max(0.5, Math.min(10, s + delta)))
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
    setIsDragging(true)
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      setOffset({
        x: dragRef.current.ox + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.oy + (ev.clientY - dragRef.current.startY),
      })
    }
    function onUp() {
      dragRef.current = null
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleBackdropClick(e: React.MouseEvent) {
    // Close only when clicking the backdrop itself, not the image.
    if (e.target === containerRef.current) onClose()
  }

  function resetZoom() {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      data-testid="attachment-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${alt}`}
    >
      {/* Controls row */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          type="button"
          className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20 transition-colors"
          onClick={resetZoom}
          data-testid="lightbox-reset-zoom"
        >
          Reset
        </button>
        <button
          type="button"
          aria-label="Close preview"
          className="rounded-md bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors"
          onClick={onClose}
          data-testid="lightbox-close"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>

      {/* Zoom hint */}
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/40 select-none pointer-events-none">
        Scroll to zoom · Drag to pan · Esc to close
      </p>

      {/* Image */}
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        data-testid="lightbox-image-wrapper"
      >
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] rounded shadow-2xl"
          draggable={false}
          data-testid="lightbox-image"
        />
      </div>
    </div>
  )
}

// ---- AttachmentRow ----------------------------------------------------------
//
// landr-7dya.4 — images show a thumbnail preview; clicking opens the lightbox.
// Non-images show a file icon. All attachments keep a download affordance.

type AttachmentRowProps = {
  attachment: TicketAttachment
}

export function AttachmentRow({ attachment }: AttachmentRowProps) {
  const isImage = attachment.content_type.startsWith('image/')

  const [signingUrl, setSigningUrl] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // Start as `true` for images so the skeleton renders immediately without
  // a synchronous setState in the effect body.
  const [fetchingPreview, setFetchingPreview] = useState(isImage)
  const sizeKB = Math.ceil(attachment.size_bytes / 1024)

  // Lazy-load a signed URL for the image thumbnail on mount (images only).
  // fetchingPreview is initialised to `true` for images so the skeleton
  // renders on first paint; the effect only flips it to false after the fetch
  // resolves (success or failure), avoiding a synchronous setState-in-effect
  // that the React Compiler flags.
  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    getAttachmentSignedUrl(attachment.storage_path)
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url)
          setFetchingPreview(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFetchingPreview(false)
      })
    return () => { cancelled = true }
  }, [isImage, attachment.storage_path])

  async function handleDownload() {
    setSigningUrl(true)
    try {
      const url = previewUrl ?? await getAttachmentSignedUrl(attachment.storage_path)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      a.click()
    } catch (err) {
      toast.error(
        t.ticketDetail.attachmentToastError(attachment.filename),
        {
          description: err instanceof Error ? err.message : undefined,
        },
      )
    } finally {
      setSigningUrl(false)
    }
  }

  return (
    <>
      <div
        className="bg-card border-input flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
        data-testid={`attachment-row-${attachment.id}`}
      >
        {/* Thumbnail (images) or icon (non-images) */}
        <div className="shrink-0 mt-0.5">
          {isImage ? (
            fetchingPreview ? (
              <div
                className="size-10 rounded bg-muted animate-pulse"
                aria-hidden
              />
            ) : previewUrl ? (
              <button
                type="button"
                className="relative size-10 overflow-hidden rounded border border-border focus-visible:outline-2 focus-visible:outline-ring group"
                onClick={() => setLightboxOpen(true)}
                aria-label={`Preview ${attachment.filename}`}
                data-testid={`attachment-thumbnail-${attachment.id}`}
              >
                <img
                  src={previewUrl}
                  alt={attachment.filename}
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <ZoomInIcon className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                </span>
              </button>
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            )
          ) : (
            <FileIcon className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>

        {/* Metadata */}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{attachment.filename}</span>
          <span className="text-muted-foreground text-xs">
            {isImage ? 'Image' : attachment.content_type} · {sizeKB} KB
          </span>
        </span>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isImage && previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Full-screen preview of ${attachment.filename}`}
              data-testid={`attachment-preview-btn-${attachment.id}`}
            >
              <ZoomInIcon className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={signingUrl}
            aria-label={`Download ${attachment.filename}`}
            data-testid={`attachment-download-${attachment.id}`}
          >
            {signingUrl ? (
              <span className="text-xs">…</span>
            ) : (
              <DownloadIcon className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {/* Lightbox (images only) */}
      {lightboxOpen && previewUrl ? (
        <AttachmentLightbox
          src={previewUrl}
          alt={attachment.filename}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  )
}
