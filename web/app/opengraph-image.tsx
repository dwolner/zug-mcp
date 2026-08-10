import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#EDE5D8',
        }}
      >
        <span style={{ fontSize: 24, color: '#596D69', fontFamily: 'monospace' }}>
          זוּג · Hebrew for &quot;pair&quot;
        </span>
        <span style={{ fontSize: 64, fontWeight: 600, color: '#22302B', marginTop: 24 }}>
          AI that remembers <span style={{ color: '#B5603A' }}>how you think.</span>
        </span>
      </div>
    ),
    { ...size }
  );
}
