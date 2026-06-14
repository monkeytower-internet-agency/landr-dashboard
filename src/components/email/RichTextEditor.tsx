/**
 * RichTextEditor — a small TipTap-based WYSIWYG surface used by ResendDialog
 * (landr-ri8a) so operators can format an outbound email body with headings,
 * lists, bold/italic and links WITHOUT touching raw HTML.
 *
 * Design notes / tradeoffs:
 *  - TipTap normalises any input HTML to its own ProseMirror schema. A real
 *    transactional email body is often a full <html> document with inline
 *    styles and <table> layout; loading that here STRIPS those styles/tables
 *    down to the rich-text primitives the schema supports (headings, lists,
 *    bold/italic, links, paragraphs). That is an accepted tradeoff for an
 *    ad-hoc "modify before send" — the operator is composing a short message,
 *    not preserving a pixel-perfect template. The HTML-source escape hatch in
 *    ResendDialog remains for the rare case the raw markup must be edited.
 *  - The editing surface is forced to a light (white) background with dark
 *    text in BOTH app themes — you are editing a light-inbox email, so the
 *    surface mirrors the eventual render rather than the dashboard chrome.
 */
import { useEffect } from 'react'
import {
  useEditor,
  useEditorState,
  EditorContent,
  type Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

export type RichTextEditorProps = {
  /** Initial HTML body to load into the editor (normalised to TipTap's schema). */
  initialHtml: string
  /**
   * Called whenever the document changes, with the editor's current HTML and
   * plain-text serialisations. ResendDialog uses these for the resend payload.
   */
  onChange: (value: { html: string; text: string }) => void
}

/**
 * A transactional email body is frequently a full `<html><body>…</body></html>`
 * document. TipTap only wants the body *content*, so peel the <body> when the
 * input looks like a complete document; otherwise pass the fragment through.
 */
function extractBodyContent(html: string): string {
  if (!html) return ''
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (match) return match[1]
  return html
}

type ToolbarButtonProps = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  testId: string
  children: React.ReactNode
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  testId,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      data-active={active ? 'true' : undefined}
      onMouseDown={(e) => {
        // Keep the editor selection — toolbar clicks must not steal focus.
        e.preventDefault()
      }}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded text-sm',
        'text-slate-700 hover:bg-slate-200 disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-slate-300 text-slate-900',
      )}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  // Subscribe to the editor state so active flags re-render on every
  // transaction — including stored-mark changes from an empty-selection
  // bold/italic toggle, which a plain editor.isActive() read can miss.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      link: editor.isActive('link'),
    }),
  })

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 p-1"
      data-testid="rte-toolbar"
    >
      <ToolbarButton
        label={t.emailLog.rteHeading1}
        testId="rte-h1"
        active={active.h1}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t.emailLog.rteHeading2}
        testId="rte-h2"
        active={active.h2}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label={t.emailLog.rteBold}
        testId="rte-bold"
        active={active.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t.emailLog.rteItalic}
        testId="rte-italic"
        active={active.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="size-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label={t.emailLog.rteBulletList}
        testId="rte-bullet-list"
        active={active.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label={t.emailLog.rteOrderedList}
        testId="rte-ordered-list"
        active={active.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />

      <ToolbarButton
        label={t.emailLog.rteLink}
        testId="rte-link"
        active={active.link}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
            return
          }
          const previous = editor.getAttributes('link').href as
            | string
            | undefined
          const url = window.prompt(t.emailLog.rteLinkPrompt, previous ?? 'https://')
          // Cancelled prompt → leave selection untouched.
          if (url === null) return
          if (url === '') {
            editor.chain().focus().unsetLink().run()
            return
          }
          editor
            .chain()
            .focus()
            .extendMarkRange('link')
            .setLink({ href: url })
            .run()
        }}
      >
        <LinkIcon className="size-4" />
      </ToolbarButton>
    </div>
  )
}

export function RichTextEditor({ initialHtml, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Use the dedicated Link extension (installed per spec) instead of the
        // one bundled in StarterKit v3, so we control openOnClick/autolink.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: extractBodyContent(initialHtml),
    editorProps: {
      attributes: {
        // The editing surface is the email surface: light, dark text, both themes.
        class: cn(
          'rte-prose min-h-48 max-h-[28rem] overflow-y-auto bg-white px-4 py-3',
          'text-slate-900 focus:outline-none',
        ),
        'data-testid': 'rte-editor',
        'aria-label': t.emailLog.rteAriaLabel,
      },
    },
    onUpdate: ({ editor }) => {
      onChange({ html: editor.getHTML(), text: editor.getText() })
    },
  })

  // Emit the initial serialisation once the editor is ready so the parent's
  // payload reflects the loaded body even if the operator sends unchanged.
  useEffect(() => {
    if (editor) {
      onChange({ html: editor.getHTML(), text: editor.getText() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
