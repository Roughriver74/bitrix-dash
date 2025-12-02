/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: 'standalone',
	// Image optimization
	images: {
		unoptimized: false,
	},
	webpack: (config) => {
		config.module.rules.push({
			test: /\.node$/,
			use: 'node-loader',
		});
		config.externals.push('@libsql/client', 'better-sqlite3');
		return config;
	},
}

module.exports = nextConfig