import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { setRichMarkdownImageResolverContext } from './rich-markdown-image-context'

export function useRichMarkdownImageUrls(
  editor: Editor | null,
  imageUrls?: Record<string, string>
): void {
  useEffect(() => {
    if (editor) {
      setRichMarkdownImageResolverContext(editor, { filePath: '', imageUrls })
    }
  }, [editor, imageUrls])
}
