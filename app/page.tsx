// app/page.tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  // 一進到 "/" 就自動導到 /stocks
  redirect('/short_term_rented');
}
