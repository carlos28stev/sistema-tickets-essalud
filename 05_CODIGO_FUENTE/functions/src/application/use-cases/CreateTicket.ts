import { TicketRepository } from '../../domain/repositories/TicketRepository';
import { Ticket } from '../../domain/entities/Ticket';

export class CreateTicket {
  constructor(private readonly tickets: TicketRepository) {}

  async execute(ticket: Ticket): Promise<Ticket> {
    if (!ticket.title.trim() || !ticket.description.trim()) {
      throw new Error('TITLE_AND_DESCRIPTION_REQUIRED');
    }
    return this.tickets.create(ticket);
  }
}
