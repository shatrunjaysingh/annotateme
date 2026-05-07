import { create } from 'zustand';

export interface Tenant {
  id: string;
  name: string;
}

interface TenantState {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  setTenants: (t: Tenant[]) => void;
  setActiveTenant: (t: Tenant | null) => void;
}

const storedActiveTenant = (): Tenant | null => {
  try {
    const raw = localStorage.getItem('activeTenant');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const useTenantStore = create<TenantState>((set) => ({
  tenants: [],
  activeTenant: storedActiveTenant(),

  setTenants: (tenants) => set({ tenants }),

  setActiveTenant: (tenant) => {
    if (tenant) {
      localStorage.setItem('activeTenant', JSON.stringify(tenant));
    } else {
      localStorage.removeItem('activeTenant');
    }
    set({ activeTenant: tenant });
  },
}));
