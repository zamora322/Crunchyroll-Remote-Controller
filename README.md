# 📱 Crunchyroll Remote Controller

Un control remoto web ligero y rápido para controlar la reproducción de videos en **Crunchyroll** (en tu navegador de PC) directamente desde tu **teléfono móvil**, sin necesidad de instalar apps móviles ni herramientas complejas.

---

## 🌟 Características

- ⏯️ **Play / Pause**: Pausa o reanuda el episodio al instante.
- ⏪ **Retroceder / Avanzar (-10s / +10s)**: Salta rápidamente cualquier escena.
- 🔊 **Control de Volumen con Slider**: Sube, baja o silencia (*Mute*) el volumen en tiempo real.
- ⏭️ **Siguiente Episodio**: Pasa al siguiente capítulo sin tocar el teclado.
- ⏩ **Saltar Intro**: Detecta el botón de skip de Crunchyroll o adelanta automáticamente la duración típica de un opening.
- 📺 **Pantalla Completa**: Alterna pantalla completa inmersiva en tu monitor.
- 📳 **Vibración Háptica**: Respuesta táctil en tu celular al pulsar los botones.
- 📡 **Baja latencia**: Comunicación instantánea mediante WebSockets locales.

---

## 🛠️ ¿Cómo funciona?

El sistema se compone de tres partes muy sencillas:

```text
[ Teléfono Móvil ]  <-- (Wi-Fi local) -->  [ Servidor Python ]  <-- (WebSocket) -->  [ Extensión Chrome ]  -->  [ Reproductor Crunchyroll ]
 (Web en navegador)                           (FastAPI Relay)                            (Manifest V3)
```

1. **Servidor Local (`server.py`)**: Corre en tu PC. Aloja la página web del control remoto y actúa como repetidor (*relay*) enviando tus acciones al navegador.
2. **Web Móvil (`static/`)**: Una página táctil optimizada para celular con modo oscuro y botones accesibles.
3. **Extensión de Chrome (`extension/`)**: Detecta los comandos recibidos y manipula el reproductor de Crunchyroll sin interferencias.

---

## 📋 Requisitos Previos

- **Python 3.8+** instalado en tu PC.
- Navegador **Google Chrome** (o compatible con Chromium como Brave o Edge).
- Que tu PC y tu teléfono móvil estén conectados a la **misma red Wi-Fi**.

---

## 🚀 Instalación y Uso (Paso a Paso)

### 1. Preparar el Servidor en tu PC

Abre una terminal (PowerShell o CMD) en la carpeta del proyecto:

1. **Crea el entorno virtual de Python:**
   ```powershell
   python -m venv .venv
   ```

2. **Activa el entorno virtual:**
   - En Windows (PowerShell):
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - En Windows (CMD):
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
   - En Mac/Linux:
     ```bash
     source .venv/bin/activate
     ```

3. **Instala las dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Inicia el servidor:**
   ```bash
   python server.py
   ```

Al arrancar, el servidor te mostrará en pantalla la dirección de tu PC y la URL para tu celular. Por ejemplo:
```text
============================================================
 🚀 Crunchyroll Controller Server Running
 • PC Local URL:   http://localhost:8000
 • Mobile LAN URL: http://192.168.1.84:8000
 • WebSocket:      ws://localhost:8000/ws
============================================================
```

---

### 2. Instalar la Extensión en Google Chrome

Solo debes hacerlo la primera vez:

1. Abre Google Chrome y escribe en la barra de direcciones:
   ```text
   chrome://extensions/
   ```
2. Activa el interruptor **"Modo de desarrollador"** (ubicado en la esquina superior derecha).
3. Haz clic en el botón **"Cargar descomprimida"** (Load unpacked).
4. Selecciona la carpeta `extension` dentro de este proyecto.

---

### 3. ¡A Controlar Crunchyroll!

1. En tu PC, entra a [Crunchyroll](https://www.crunchyroll.com/) y reproduce cualquier serie.
   *(Verás una pequeña notificación verde abajo a la izquierda: `Control Remoto Conectado 🟢`)*.
2. En tu teléfono móvil, abre el navegador (Chrome, Safari, etc.) y escribe la dirección **Mobile LAN URL** que mostró la consola (ejemplo: `http://192.168.1.84:8000`).
3. ¡Listo! Ya puedes acostarte en tu cama o sillón y controlar Crunchyroll desde tu celular.

---

## ❓ Preguntas Frecuentes y Solución de Problemas

### 1. Mi teléfono dice "No se puede acceder al sitio web"
- Asegúrate de que tu celular esté conectado a la **misma red Wi-Fi** que la PC.
- Si Windows te muestra una alerta del Firewall al ejecutar `server.py`, selecciona **"Permitir acceso en redes privadas"**.

### 2. Toco los botones en el celular pero no pasa nada en la PC
- **Recarga la pestaña de Crunchyroll (F5)** en tu PC. Si abriste la serie antes de activar la extensión, debes refrescar la página para que se inyecte el script.
- En la terminal del servidor deberías ver:
  ```text
  Client connected: ... (Active connections: 2)
  ```
  *(Significa que tanto el celular como Chrome están conectados).*

### 3. ¿Cómo cierro el servidor?
- En la terminal de tu PC, presiona `Ctrl + C`.
