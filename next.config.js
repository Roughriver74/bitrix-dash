/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: 'standalone',
	// Image optimization
	images: {
		unoptimized: false,
	},
}

module.exports = nextConfig