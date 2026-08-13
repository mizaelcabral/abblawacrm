import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ponytail: lightweight HTML metadata scraper for Open Graph link previews without heavy external libraries
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // SSRF prevention: only allow http and https protocols
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Protocol not allowed" }, { status: 400 });
    }

    // SSRF prevention: disallow local/private IP hosts
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.endsWith(".local")
    ) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
    }

    // Fetch HTML with a 4s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ domain: parsedUrl.hostname, url: targetUrl });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return NextResponse.json({ domain: parsedUrl.hostname, url: targetUrl });
    }

    // Get first 100KB of HTML to parse head metadata quickly
    const text = await res.text();
    const htmlSnippet = text.slice(0, 100000);

    const getMetaContent = (propertyOrName: string) => {
      const match =
        htmlSnippet.match(new RegExp(`<meta[^>]*?(?:property|name)=["']${propertyOrName}["'][^>]*?content=["']([^"']+)["']`, "i")) ||
        htmlSnippet.match(new RegExp(`<meta[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["']${propertyOrName}["']`, "i"));
      return match ? match[1].trim() : null;
    };

    const ogTitle = getMetaContent("og:title") || getMetaContent("twitter:title");
    const ogDesc = getMetaContent("og:description") || getMetaContent("description") || getMetaContent("twitter:description");
    let ogImage = getMetaContent("og:image") || getMetaContent("twitter:image");

    // Title fallback
    const titleMatch = htmlSnippet.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = ogTitle || (titleMatch ? titleMatch[1].trim() : null) || parsedUrl.hostname;

    // Resolve relative image URLs if present
    if (ogImage && !ogImage.startsWith("http://") && !ogImage.startsWith("https://")) {
      try {
        ogImage = new URL(ogImage, parsedUrl.origin).href;
      } catch {
        ogImage = null;
      }
    }

    return NextResponse.json(
      {
        url: targetUrl,
        domain: parsedUrl.hostname.replace(/^www\./, ""),
        title,
        description: ogDesc ? ogDesc.slice(0, 180) : null,
        image: ogImage,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch link metadata" }, { status: 500 });
  }
}
