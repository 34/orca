export function multiRepoAttachmentName(file: { id: string; name: string }): string {
  const extension = /\.([a-zA-Z0-9]{1,12})$/.exec(file.name)?.[1] ?? 'bin'
  return `context-${file.id}.${extension}`
}
