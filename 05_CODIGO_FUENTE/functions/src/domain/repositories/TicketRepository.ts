import { Ticket } from '../entities/Ticket';

export interface TicketRepository {
  create(ticket: Ticket): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  update(ticket: Ticket): Promise<Ticket>;
}
