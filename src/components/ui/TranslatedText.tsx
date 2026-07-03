import React, { useEffect, useState } from 'react';

const cache = new Map<string, string>();

export function TranslatedText({ text, lang }: { text: string; lang: 'ar' | 'ur' | 'hi' }) {
  const [translated, setTranslated] = useState(text);

  useEffect(() => {
    if (!text) {
      setTranslated('');
      return;
    }
    if (lang === 'ar') {
      setTranslated(text);
      return;
    }
    
    const key = `${lang}:${text}`;
    if (cache.has(key)) {
      setTranslated(cache.get(key)!);
      return;
    }

    let isMounted = true;

    const fetchTranslation = async () => {
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        const result = data[0].map((item: any) => item[0]).join('');
        cache.set(key, result);
        if (isMounted) setTranslated(result);
      } catch (e) {
        console.error('Translation error:', e);
        if (isMounted) setTranslated(text);
      }
    };

    fetchTranslation();

    return () => {
      isMounted = false;
    };
  }, [text, lang]);

  return <>{translated}</>;
}
