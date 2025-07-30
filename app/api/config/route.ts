import { NextResponse } from 'next/server';
import { readConfig, writeConfig, validateConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = await readConfig();
    
    // Return config without sensitive data in production
    return NextResponse.json({
      webhookUrl: config.webhookUrl ? '***configured***' : null,
      departmentName: config.departmentName || null,
      isConfigured: !!(config.webhookUrl && config.departmentName)
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { webhookUrl, departmentName } = body;

    // Validate required fields
    if (!webhookUrl || !departmentName) {
      return NextResponse.json(
        { error: 'Webhook URL и название отдела обязательны' },
        { status: 400 }
      );
    }

    // Validate webhook URL format - allow any domain with /rest/ID/token/ structure
    if (!webhookUrl.match(/^https:\/\/[^\/]+\/rest\/\d+\/[\w-]+\/$/)) {
      return NextResponse.json(
        { error: 'Неверный формат webhook URL' },
        { status: 400 }
      );
    }

    // Validate configuration by testing the webhook
    const isValid = await validateConfig(webhookUrl, departmentName);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Не удалось подключиться к Битрикс24 или найти указанный отдел' },
        { status: 400 }
      );
    }

    // Save configuration
    await writeConfig({
      webhookUrl,
      departmentName,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}