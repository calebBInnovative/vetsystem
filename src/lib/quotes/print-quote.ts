import { printRecibo } from '@/lib/invoices/print-receipt';
import type { QuoteWithDetails } from '@/types/quote';
import type { InvoiceWithDetails, InvoiceItem } from '@/types/invoice';
import type { SessionLocal } from '@/types/license';

/**
 * Prints a quote on the same paper layout as a receipt, so the client gets a
 * document that looks like the clinic's invoice — but labelled COTIZACIÓN,
 * with no payment line and with its validity date.
 *
 * The quote is adapted to the receipt's shape instead of duplicating the
 * layout; nothing is written to the invoices table.
 */
export function printQuote(quote: QuoteWithDetails, session: SessionLocal | null): void {
  const items: InvoiceItem[] = quote.items.map((item) => ({
    id:          item.id,
    description: item.description,
    quantity:    item.quantity,
    unitPrice:   item.unitPrice,
    subtotal:    item.subtotal,
    type:        item.itemType === 'service' ? 'service' : 'product',
    productId:   item.productId,
  }));

  const asReceipt: InvoiceWithDetails = {
    id:            quote.id,
    number:        quote.number,
    clinicId:      quote.clinicId,
    date:          quote.date,
    items,
    subtotal:      quote.subtotal,
    discount:      quote.discount,
    total:         quote.total,
    paymentMethod: 'cash',
    status:        'pending',
    amountPaid:    0,
    notes:         quote.notes,
    patientId:     quote.patientId,
    createdAt:     quote.createdAt,
    updatedAt:     quote.updatedAt,
    syncStatus:    quote.syncStatus,
    patientName:   quote.patientName,
    ownerName:     quote.ownerName,
    ownerPhone:    quote.ownerPhone,
  };

  printRecibo(asReceipt, session, {
    documentLabel:  'COTIZACIÓN',
    hidePaymentRow: true,
    validUntil:     quote.validUntil,
  });
}
