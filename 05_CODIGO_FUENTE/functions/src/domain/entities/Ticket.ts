export type TicketStatus =
  | 'ABIERTO'
  | 'ASIGNADO'
  | 'EN_PROGRESO'
  | 'PENDIENTE_INFORMACION'
  | 'RESUELTO'
  | 'CERRADO'
  | 'CANCELADO';

export type TicketPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Ticket {
  id: string;
  code: string;
  requesterId: string;
  assignedTechnicianId?: string;
  establishmentId: string;
  title: string;
  description: string;
  categoryId: string;
  priority: TicketPriority;
  status: TicketStatus;
  classificationConfidence?: number;
  classificationSource: 'RULES' | 'NLP' | 'MANUAL';
  slaDueAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
