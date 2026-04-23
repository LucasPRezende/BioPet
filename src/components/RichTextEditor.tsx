'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const externalUpdate = useRef(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({}),
      Underline,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rte-content',
        'data-placeholder': placeholder ?? 'Digite o texto do laudo...',
      },
    },
    onUpdate({ editor }) {
      if (externalUpdate.current) return // ignora update causado por setContent externo
      onChange(editor.getHTML())
    },
  })

  // Sincroniza quando `value` muda externamente (ex: AI review)
  useEffect(() => {
    if (!editor) return
    if (value === editor.getHTML()) return // nada mudou
    externalUpdate.current = true
    editor.commands.setContent(value, { emitUpdate: false })
    externalUpdate.current = false
  }, [value, editor])

  if (!editor) return null

  const btn = (
    onClick: () => void,
    active: boolean,
    title: string,
    label: React.ReactNode
  ) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2.5 py-1 rounded text-sm font-medium transition select-none ${
        active
          ? 'bg-[#19202d] text-white'
          : 'text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )

  const sep = <div className="w-px bg-gray-200 mx-0.5 self-stretch" />

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#8a6e36]">
      {/* Barra de ferramentas */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {btn(() => editor.chain().focus().toggleBold().run(),      editor.isActive('bold'),      'Negrito (Ctrl+B)',    <strong>N</strong>)}
        {btn(() => editor.chain().focus().toggleItalic().run(),    editor.isActive('italic'),    'Itálico (Ctrl+I)',    <em>I</em>)}
        {btn(() => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Sublinhado (Ctrl+U)', <span className="underline">S</span>)}

        {sep}

        {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive('heading', { level: 2 }), 'Título grande', <span className="text-xs font-bold">T1</span>)}
        {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          editor.isActive('heading', { level: 3 }), 'Título médio',  <span className="text-xs font-bold">T2</span>)}

        {sep}

        {btn(() => editor.chain().focus().toggleBulletList().run(),
          editor.isActive('bulletList'), 'Lista com marcadores',
          <span className="text-xs leading-none">≡•</span>)}
        {btn(() => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive('orderedList'), 'Lista numerada',
          <span className="text-xs leading-none">1.</span>)}

        {sep}

        {btn(() => editor.chain().focus().undo().run(), false, 'Desfazer (Ctrl+Z)', '↩')}
        {btn(() => editor.chain().focus().redo().run(), false, 'Refazer (Ctrl+Y)',  '↪')}
      </div>

      {/* Área de texto */}
      <EditorContent editor={editor} />
    </div>
  )
}
