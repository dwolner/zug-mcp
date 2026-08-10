import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#B5603A',
          borderRadius: '6px',
        }}
      >
        <span style={{ color: '#EDE5D8', fontSize: 20, fontWeight: 700 }}>Z</span>
      </div>
    ),
    { ...size }
  );
}
