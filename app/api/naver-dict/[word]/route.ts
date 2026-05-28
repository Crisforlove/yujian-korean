import { NextRequest, NextResponse } from 'next/server';

/**
 * Safe, cached proxy for Naver Dictionary internal JSON (unofficial /api3).
 * 
 * Purpose: Provide a lightweight "quick preview" inside the app for basic meanings + examples.
 * Primary experience remains the "Open in Naver" buttons (best etymology/Hanja visuals).
 * 
 * This is intentionally defensive:
 * - Short timeout
 * - Strict headers (Referer is critical)
 * - Limited results
 * - Graceful empty response on any failure (frontend shows big Naver button instead)
 */

interface NaverPreviewItem {
  entry?: string;
  means?: Array<{ value?: string; partOfSpeech?: string }>;
  examples?: Array<{ origin?: string; translation?: string }>;
}

const CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes — words don't change

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ word: string }> }
) {
  const { word } = await params;
  const decodedWord = decodeURIComponent(word).trim();

  if (!decodedWord || decodedWord.length > 50) {
    return NextResponse.json({ items: [] }, { status: 400 });
  }

  // Simple cache
  const cacheKey = decodedWord;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const encoded = encodeURIComponent(decodedWord);
    // Try Korean-Korean first (richest data), fallback pattern
    const url = `https://ko.dict.naver.com/api3/koko/search?query=${encoded}&range=word&page=1&shouldSearchOpen=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500); // short timeout for serverless

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Referer': 'https://ko.dict.naver.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,zh-CN;q=0.8,en;q=0.7',
        'Origin': 'https://ko.dict.naver.com',
      },
      signal: controller.signal,
      // @ts-ignore - Next.js edge/runtime fetch
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ items: [] });
    }

    const json = await res.json();

    // Extract a small, useful preview (top 2-3 items)
    const wordItems = json?.searchResultMap?.searchResultListMap?.WORD?.items || [];
    const previewItems: NaverPreviewItem[] = wordItems.slice(0, 2).map((item: any) => ({
      entry: item.entry,
      means: (item.means || []).slice(0, 3).map((m: any) => ({
        value: m.value,
        partOfSpeech: m.partOfSpeech,
      })),
      examples: (item.exampleList || []).slice(0, 2).map((ex: any) => ({
        origin: ex.origin,
        translation: ex.translation,
      })),
    }));

    const payload = { items: previewItems, source: 'naver-internal' };

    CACHE.set(cacheKey, { data: payload, timestamp: Date.now() });

    return NextResponse.json(payload);
  } catch (error) {
    // Any network / parsing / anti-bot issue → graceful empty (frontend falls back to Naver button)
    return NextResponse.json({ items: [] });
  }
}
