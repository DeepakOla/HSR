import type { Locale } from './constants';

const copy = {
  en: {
    nav: {
      home: 'Home',
      services: 'Services',
      how: 'How it works',
      expiry: 'Check expiry',
      book: 'Book',
      contact: 'Contact',
      about: 'About',
      blog: 'Guides',
    },
    actions: {
      book: 'Book Appointment',
      call: 'Call',
      directions: 'Directions',
    },
    booking: {
      title: 'Book CNG Cylinder Hydro Testing',
    },
  },
  hi: {
    nav: {
      home: 'होम',
      services: 'सेवाएँ',
      how: 'प्रक्रिया',
      expiry: 'एक्सपायरी जाँचें',
      book: 'बुक करें',
      contact: 'संपर्क',
      about: 'हमारे बारे में',
      blog: 'गाइड',
    },
    actions: {
      book: 'अपॉइंटमेंट बुक करें',
      call: 'कॉल करें',
      directions: 'दिशा देखें',
    },
    booking: {
      title: 'सीएनजी सिलेंडर हाइड्रो टेस्टिंग बुक करें',
    },
  },
} as const;

export function t(locale: Locale) {
  return copy[locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'hi' : 'en';
}

export function localizePath(pathname: string, to: Locale): string {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (normalized.startsWith('/en/')) return normalized.replace('/en/', `/${to}/`);
  if (normalized.startsWith('/hi/')) return normalized.replace('/hi/', `/${to}/`);
  return `/${to}/`;
}
