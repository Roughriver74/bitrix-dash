import { NextResponse } from 'next/server';
import { BitrixClient } from '@/lib/bitrix/client';
import { DepartmentService } from '@/lib/bitrix/services/DepartmentService';
import { getConfiguredWebhookUrl } from '@/lib/config';
import { BitrixDepartment } from '@/lib/bitrix/types';
import { prisma } from '@/lib/prisma';

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
 * POST /api/bitrix/departments
 * Создает новый "виртуальный" отдел в локальной БД (не в Битрикс24)
 */
export async function POST(request: Request) {
  try {
    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Название отдела обязательно' },
        { status: 400 }
      );
    }

    // Проверяем, существует ли уже отдел с таким названием
    const existingDepartment = await prisma.department.findUnique({
      where: { name: name.trim() },
    });

    if (existingDepartment) {
      return NextResponse.json(
        { error: 'Отдел с таким названием уже существует' },
        { status: 409 }
      );
    }

    // Создаем новый отдел с автогенерированным ID
    const department = await prisma.department.create({
      data: {
        id: `custom_${Date.now()}`, // Префикс "custom_" для отличия от ID Битрикс24
        name: name.trim(),
      },
    });

    return NextResponse.json(
      {
        department: {
          id: department.id,
          name: department.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Departments POST error:', error);
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Не удалось создать отдел';
    
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

