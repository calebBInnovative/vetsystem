import * as XLSX from 'xlsx';

export function downloadProductTemplate() {
  const wb = XLSX.utils.book_new();

  const data = [
    ['Nombre', 'Categoría', 'Precio de venta', 'Precio de costo', 'Stock actual', 'Stock mínimo', 'Unidad', 'Activo'],
    ['Amoxicilina 500mg',  'Medicamento', 150, 80,  50, 10, 'Tableta',   'Sí'],
    ['Vacuna Antirrábica', 'Vacuna',      120, 60,  30, 10, 'Ampolleta', 'Sí'],
    ['Royal Canin 3kg',    'Alimento',    450, 320, 15,  5, 'kg',        'Sí'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  const opts: (string | null)[][] = [
    ['CATEGORÍAS VÁLIDAS', '', 'UNIDADES VÁLIDAS'],
    ['Medicamento',     '', 'Unidad'],    ['Vacuna',      '', 'Caja'],
    ['Antiparasitario', '', 'Botella'],   ['Alimento',    '', 'Ampolleta'],
    ['Accesorio',       '', 'Tableta'],   ['Higiene',     '', 'Dosis'],
    ['Cirugía',         '', 'mL'],        ['Laboratorio', '', 'mg'],
    ['Otro',            '', 'kg'],        [null,          '', 'Gramo'],
    [null,              '', 'Litro'],     [null,          '', 'Libra'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(opts);
  ws2['!cols'] = [{ wch: 18 }, { wch: 4 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Opciones_válidas');

  XLSX.writeFile(wb, 'plantilla_productos.xlsx');
}
