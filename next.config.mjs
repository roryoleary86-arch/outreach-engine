/** @type {import('next').NextConfig} */
const nextConfig = {
  // voice-profile.md is read with fs at runtime; make sure Vercel's
  // serverless bundle for the draft route includes it.
  outputFileTracingIncludes: {
    "/api/draft": ["./voice-profile.md"],
  },
};

export default nextConfig;
