import type { NextConfig } from "next";

// حماية أساسية لكل الصفحات. (CSP كاملة بـ nonce لاحقاً، مع شاشات الكاميرا.)
const securityHeaders = [
  // ما حدا بيقدر يحط التطبيق جوا iframe ويخدع الأدمن يكبس "إيقاف" أو "رمز جديد"
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // الكاميرا لتصوير فورم الجرد، والمايك لمساعد الأدمن
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  // المتصفح بيتجاهله على http المحلي
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // صور الجرد والتالف بتنضغط بالجوال قبل الرفع (أقل من 2MB عادة)
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
