import { useEffect, useState } from 'react';

/** Remote ad photo. no-referrer keeps portals from blocking hot-linked images. */
export function RemotePhoto({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`photo-missing ${className ?? ''}`}>🏠</div>;
  return <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Photo stored on the device as a Blob. */
export function BlobPhoto({ blob, alt = '', className }: { blob: Blob; alt?: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
