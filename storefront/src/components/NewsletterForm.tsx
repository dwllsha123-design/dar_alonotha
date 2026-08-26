import { FormEvent, useState } from 'react';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
    setEmail('');
  }

  if (done) {
    return <p className="newsletter-done">شكراً — تم تسجيل بريدكِ للنشرة.</p>;
  }

  return (
    <form className="newsletter-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="newsletter-email">
        البريد الإلكتروني
      </label>
      <input
        id="newsletter-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="عنوان بريدك الإلكتروني"
        required
        dir="ltr"
      />
      <button className="btn" type="submit">
        اشترك
      </button>
    </form>
  );
}
