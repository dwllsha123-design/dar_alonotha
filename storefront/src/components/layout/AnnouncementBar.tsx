import { useEffect, useState } from 'react';
import { ANNOUNCEMENTS } from '../../data/siteContent';

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (ANNOUNCEMENTS.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % ANNOUNCEMENTS.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="announce-bar" role="status">
      <div className="container announce-bar-inner">
        <p key={index} className="announce-text">
          {ANNOUNCEMENTS[index]}
        </p>
      </div>
    </div>
  );
}
