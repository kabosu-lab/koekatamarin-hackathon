/** 付けられた写真か PDF。読めるかどうかは配信の入口で確かめる。 */
export function AttachmentPreview({ attachment }: { attachment: { id: string; mediaType: string; fileName: string } }) {
  const url = `/api/attachments/${attachment.id}`;
  if (attachment.mediaType === "application/pdf") {
    return (
      <a className="attachment-file" href={url} download={attachment.fileName}>
        PDF を保存する（{attachment.fileName}）
      </a>
    );
  }
  // 預かった画像を本人の範囲で配るので、外部の最適化を通さない
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="attachment-image" src={url} alt={`添付の写真（${attachment.fileName}）`} />;
}
