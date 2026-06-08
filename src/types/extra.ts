export interface Extra {
  id: string;
  name: string;
  icon: string;
  action: string;
}

export interface ExtrasState {
  extras: Extra[];
  editingId: string | null;
}