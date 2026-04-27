import { NextResponse } from 'next/server';
import { authConfigured, isAdminRequest } from '@/lib/auth';

export async function GET(request: Request) {
  return NextResponse.json({
    isAdmin: isAdminRequest(request),
    configured: authConfigured(),
  });
}
