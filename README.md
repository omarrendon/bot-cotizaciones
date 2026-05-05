# 🤖 Bot de Cotizaciones - Textiles San Fernando

Bot de Telegram que lee imágenes de cotizaciones escritas a mano y genera automáticamente un PDF con el formato oficial.

## ¿Cómo funciona?

1. El usuario manda una foto con la cotización escrita a mano
2. Claude Vision extrae los datos (cliente, productos, cantidades, precios)
3. Se genera el PDF con el formato de la empresa
4. El bot devuelve el PDF en el mismo chat

---

## Instalación

### 1. Clonar el proyecto

```bash
git clone <tu-repo>
cd cotizador-bot
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar LibreOffice (necesario para convertir a PDF)

**macOS:**

```bash
brew install --cask libreoffice
```

**Ubuntu/Debian (Railway ya lo tiene):**

```bash
sudo apt-get install -y libreoffice
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y agrega:

- `TELEGRAM_BOT_TOKEN` → lo obtienes hablando con @BotFather en Telegram
- `ANTHROPIC_API_KEY` → lo obtienes en https://console.anthropic.com

### 5. Crear tu bot en Telegram

1. Abre Telegram y busca **@BotFather**
2. Escribe `/newbot`
3. Ponle un nombre (ej: `Cotizaciones San Fernando`)
4. Ponle un username (ej: `sanfernando_cotizaciones_bot`)
5. Copia el token que te da y ponlo en `.env`

### 6. Iniciar el bot

```bash
npm start
```

---

## Deploy en Railway

1. Sube el proyecto a GitHub
2. Ve a [railway.app](https://railway.app) y conecta tu repo
3. En **Variables**, agrega `TELEGRAM_BOT_TOKEN` y `ANTHROPIC_API_KEY`
4. Railway detecta Node.js automáticamente y hace el deploy

> ⚠️ Railway necesita LibreOffice para convertir a PDF. Agrega esta variable:
> `NIXPACKS_APT_PKGS=libreoffice`

---

## Estructura del proyecto

```
cotizador-bot/
├── src/
│   ├── index.js                    # Bot principal de Telegram
│   └── services/
│       ├── claude.service.js       # Extracción de datos con Claude Vision
│       └── documento.service.js    # Generación del DOCX y PDF
├── template/
│   └── machote_san_fernando.docx   # Plantilla original (referencia)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Comandos del bot

| Comando  | Descripción                           |
| -------- | ------------------------------------- |
| `/start` | Bienvenida e instrucciones            |
| `/ayuda` | Guía de uso y tips para mejores fotos |
| 📸 Foto  | Procesa la imagen y devuelve el PDF   |
