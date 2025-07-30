import { BitrixClient } from '../client';
import { BitrixDepartment, BitrixUser } from '../types';

export class DepartmentService {
  constructor(private client: BitrixClient) {}

  async getDepartmentByName(name: string): Promise<BitrixDepartment | null> {
    const departments = await this.client.call<BitrixDepartment[]>('department.get');
    return this.findDepartmentRecursive(departments, name);
  }

  private findDepartmentRecursive(departments: BitrixDepartment[], name: string): BitrixDepartment | null {
    for (const dept of departments) {
      if (dept.NAME === name) return dept;
      if (dept.CHILDREN) {
        const found = this.findDepartmentRecursive(dept.CHILDREN, name);
        if (found) return found;
      }
    }
    return null;
  }

  async getDepartmentUsers(departmentId: string, includeSubdepts = true): Promise<string[]> {
    const users = await this.client.call<BitrixUser[]>('user.get', {
      filter: { UF_DEPARTMENT: departmentId }
    });

    const userIds = users.map((u) => u.ID);

    if (includeSubdepts) {
      const departments = await this.client.call<BitrixDepartment[]>('department.get');
      const subdepts = this.getSubdepartments(departments, departmentId);
      
      for (const subdeptId of subdepts) {
        const subdeptUsers = await this.client.call<BitrixUser[]>('user.get', {
          filter: { UF_DEPARTMENT: subdeptId }
        });
        userIds.push(...subdeptUsers.map((u) => u.ID));
      }
    }

    return [...new Set(userIds)];
  }

  async getAllDepartmentUsers(departmentId: string, includeSubdepts = true): Promise<string[]> {
    const allUserIds: string[] = [];
    
    const users = await this.client.getAll<BitrixUser>('user.get', {
      filter: { UF_DEPARTMENT: departmentId }
    });
    
    allUserIds.push(...users.map(u => u.ID));

    if (includeSubdepts) {
      const departments = await this.client.call<BitrixDepartment[]>('department.get');
      const subdepts = this.getSubdepartments(departments, departmentId);
      
      for (const subdeptId of subdepts) {
        const subdeptUsers = await this.client.getAll<BitrixUser>('user.get', {
          filter: { UF_DEPARTMENT: subdeptId }
        });
        allUserIds.push(...subdeptUsers.map(u => u.ID));
      }
    }

    return [...new Set(allUserIds)];
  }

  private getSubdepartments(departments: BitrixDepartment[], parentId: string): string[] {
    const subdepts: string[] = [];
    
    const findChildren = (depts: BitrixDepartment[], pid: string) => {
      for (const dept of depts) {
        if (dept.PARENT === pid) {
          subdepts.push(dept.ID);
          if (dept.CHILDREN) {
            findChildren(dept.CHILDREN, dept.ID);
          }
        }
      }
    };

    findChildren(departments, parentId);
    return subdepts;
  }
}