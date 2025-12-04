import { NextResponse } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import { getConfiguredWebhookUrl } from '@/lib/config';
import { BitrixDepartment } from '@/lib/bitrix/types';

/**
 * GET /api/bitrix/departments
 * Возвращает список всех отделов из Битрикс24
 */
export async function GET() {
  try {
    const webhookUrl = await getConfiguredWebhookUrl();
    const client = new BitrixClient(webhookUrl);
    const departmentService = new DepartmentService(client);

    // Получаем все отделы
    const departments = await client.call<BitrixDepartment[]>('department.get');

    // Преобразуем в плоский список для удобства использования
    const flatDepartments = flattenDepartments(departments);

    return NextResponse.json({
      departments: flatDepartments,
    });
  } catch (error) {
    console.error('❌ Departments GET error:', error);
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Не удалось получить список отделов';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Преобразует иерархическую структуру отделов в плоский список
 */
function flattenDepartments(departments: BitrixDepartment[]): Array<{
  id: string;
  name: string;
  parentId: string | null;
}> {
  const result: Array<{
    id: string;
    name: string;
    parentId: string | null;
  }> = [];

  function traverse(depts: BitrixDepartment[], parentId: string | null = null) {
    for (const dept of depts) {
      result.push({
        id: dept.ID,
        name: dept.NAME,
        parentId: dept.PARENT || parentId,
      });

      if (dept.CHILDREN && dept.CHILDREN.length > 0) {
        traverse(dept.CHILDREN, dept.ID);
      }
    }
  }

  traverse(departments);
  return result;
}

