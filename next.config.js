/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: 'standalone',
	// Optimize for production
	swcMinify: true,
	// Disable telemetry
	telemetry: false,
	// Image optimization
	images: {
		unoptimized: false,
	},
}

module.exports = nextConfig