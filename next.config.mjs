/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfkit', 'exceljs', 'docx', 'bcryptjs', 'jsonwebtoken'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
