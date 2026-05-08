// test-importes-grandes.js
// Prueba directa de generarCotizacion con importes que superan 7 dígitos
const { execSync } = require("child_process");
const path = require("path");
const { generarCotizacion } = require("./src/services/documento.service");

const datosPrueba = {
  cliente: "Prueba Importes Grandes S.A.",
  productos: [
    { cantidad: 150, descripcion: "Chamarra táctica SWAT ripstop premium", precioUnitario: 875.00 },   // $131,250.00 (12 chars)
    { cantidad: 80,  descripcion: "Polo manga corta piqué bordado",         precioUnitario: 320.50 },   // $25,640.00  (10 chars)
    { cantidad: 5,   descripcion: "Gorra béisbol ripstop bordada",          precioUnitario: 185.00 },   // $925.00      (7 chars, normal)
    { cantidad: 200, descripcion: "Camiseta dry-fit sublimada",             precioUnitario: 210.00 },   // $42,000.00  (10 chars)
    { cantidad: 10,  descripcion: "Pants deportivo con reflectivo",         precioUnitario: 1250.00 },  // $12,500.00  (10 chars)
  ],
};

(async () => {
  try {
    console.log("Generando cotización con importes grandes...\n");
    const { pdfPath, cotizacionId } = await generarCotizacion(datosPrueba);

    // Copiar PDF al escritorio para fácil inspección
    const destino = path.join(
      require("os").homedir(),
      "Desktop",
      `TEST_importes_grandes_${cotizacionId}.pdf`
    );
    require("fs").copyFileSync(pdfPath, destino);

    console.log(`✅ PDF generado: ${destino}`);
    console.log(`   Cotización ID: ${cotizacionId}\n`);

    // Mostrar los importes formateados para verificar
    const { productos } = datosPrueba;
    let subtotal = 0;
    productos.forEach((p) => {
      const importe = p.cantidad * p.precioUnitario;
      subtotal += importe;
      const fmt = `$${importe.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      console.log(`  ${fmt.padStart(14)}  (${fmt.length} chars)  ${p.descripcion}`);
    });
    const iva   = subtotal * 0.16;
    const total = subtotal + iva;
    const fmtSub   = `$${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
    const fmtIva   = `$${iva.toLocaleString("es-MX",   { minimumFractionDigits: 2 })}`;
    const fmtTotal = `$${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
    console.log(`\n  SUBTOTAL : ${fmtSub}  (${fmtSub.length} chars)`);
    console.log(`  IVA      : ${fmtIva}  (${fmtIva.length} chars)`);
    console.log(`  TOTAL    : ${fmtTotal}  (${fmtTotal.length} chars)`);

    // Abrir el PDF automáticamente
    execSync(`open "${destino}"`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
