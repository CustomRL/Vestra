import type { RawFile } from '../RESTOptions.js'

/**
 * Builds the `multipart/form-data` body Discord expects for file uploads.
 *
 * @param body - The JSON body, sent as the `payload_json` part.
 * @param files - The files to attach.
 * @param fields - Text parts sent as their own fields rather than inside `payload_json`.
 * @returns A `FormData` instance ready to pass to `fetch`.
 *
 * @remarks
 * The boundary and `Content-Type` header are left to `fetch`. Setting the header by hand
 * omits the generated boundary and Discord rejects the request, which is a confusing
 * failure to debug — so callers must not set it either.
 *
 * File part names matter: `files[n]` is what the `attachments` array in the JSON body
 * refers to by index, and a mismatch silently drops the attachment.
 *
 * `fields` exists for `POST /guilds/{id}/stickers`, the one endpoint whose parameters are
 * discrete text parts rather than a `payload_json` object. Both may be passed, though no
 * route needs both today.
 */
export function buildFormData(
  body: unknown,
  files: RawFile[],
  fields?: Record<string, string>,
): FormData {
  const form = new FormData()

  for (const [index, file] of files.entries()) {
    const key = file.key ?? `files[${String(index)}]`
    form.append(key, toBlob(file), file.name)
  }

  if (fields !== undefined) {
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
  }

  if (body !== undefined) {
    form.append('payload_json', JSON.stringify(body))
  }

  return form
}

/**
 * Normalises a file's contents into a `Blob`.
 *
 * @param file - The file to convert.
 * @returns A blob carrying the file's bytes and content type.
 */
function toBlob(file: RawFile): Blob {
  const options = file.contentType === undefined ? undefined : { type: file.contentType }

  if (typeof file.data === 'string') return new Blob([file.data], options)
  if (file.data instanceof Uint8Array) {
    // Copy into a standalone buffer: a Uint8Array may be a view onto a larger pooled
    // ArrayBuffer, and Blob would otherwise capture the whole pool.
    return new Blob([file.data.slice()], options)
  }
  return new Blob([file.data], options)
}
