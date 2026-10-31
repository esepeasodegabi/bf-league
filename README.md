# 🥊 Liga Fitboxing Ourense

Web para consultar y gestionar la **Liga de Fitboxing de Ourense**: clasificación, evolución de los participantes y puntos obtenidos por su actividad.

> **Estado del proyecto:** README inicial. Las funcionalidades descritas son objetivos del producto; su disponibilidad dependerá de la implementación.

## 🎯 Objetivo

Crear una competición amigable que motive a los participantes a entrenar con regularidad, mantener sus rachas y seguir su posición en la liga.

## ✨ Funcionalidades previstas

- **Clasificación general** de participantes, ordenada por puntos.
- **Ficha de participante** con puntuación y desglose de los logros.
- **Historial de entrenamientos y puntos** para entender cómo se calcula cada posición.
- **Rachas semanales y mensuales** con seguimiento de la continuidad.
- **Panel de administración** para revisar resultados, configurar ediciones y corregir incidencias, con trazabilidad de los cambios.
- **Diseño adaptable** a móvil y escritorio.

## 🏆 Reglas de puntuación

La liga contempla las siguientes categorías:

| Concepto | Regla |
| --- | --- |
| Regreso | Se evalúa en los intervalos exactos definidos por la liga. Los hitos de regreso **no son excluyentes**. |
| Racha semanal | Se consigue al completar **2 entrenamientos en una semana**. |
| Racha mensual | Se consigue al completar el objetivo semanal durante **4 semanas consecutivas**. |
| Continuidad de rachas | Los puntos por continuidad **pueden volver a concederse** cuando se cumplen de nuevo las condiciones. |
| Referidos | Solo cuentan si la persona referida **asiste a la clase reservada**. Una reserva por sí sola no puntúa. |
| Dobletes | El **segundo entrenamiento del mismo día concede 2 puntos**. No se aplican bonificaciones adicionales por más entrenamientos ese día bajo esta regla. |

**Importante:** las cantidades de puntos de otras categorías, la definición de los intervalos de regreso y el calendario exacto de cómputo deben establecerse en la configuración oficial de la liga. No se presuponen aquí.

### Criterios de cálculo recomendados

1. Cada entrenamiento debe tener un identificador único para evitar duplicados.
2. Las puntuaciones deben calcularse únicamente a partir de asistencias confirmadas.
3. Debe utilizarse una zona horaria coherente (`Europe/Madrid`) para determinar días y semanas.
4. Los puntos deben poder auditarse: fecha, evento, regla aplicada y cantidad concedida.
5. Los empates en la clasificación deben resolverse con un criterio público y estable, aún por definir.

## 🗂️ Secciones propuestas de la web

- **Inicio:** resumen de la liga, próximos hitos y acceso a la clasificación.
- **Clasificación:** posición, participante, puntos y evolución.
- **Mi progreso:** entrenamientos, rachas e historial de puntos.
- **Reglamento:** explicación transparente de todas las reglas.
- **Administración:** gestión de ediciones, incidencias y recálculos.

## 🔧 Instalación y desarrollo

El proyecto aún no tiene un stack ni comandos de arranque documentados. Cuando se configure el repositorio, completar esta sección con:

- Requisitos (runtime, gestor de paquetes y versiones).
- Variables de entorno necesarias (incluyendo un `.env.example` sin secretos).
- Instrucciones de instalación y ejecución local.
- Comandos de tests, compilación y despliegue.
- Integraciones y origen de los datos de asistencias.

## 🔐 Privacidad y seguridad

La clasificación debe mostrar solo los datos personales necesarios y autorizados. La administración requiere control de acceso; no deben publicarse credenciales, tokens ni datos internos de los participantes.

## 📌 Pendiente de definir

- Tabla oficial completa de puntos e intervalos de regreso.
- Fechas de inicio y fin de cada edición.
- Fuente de los datos de asistencia y frecuencia de actualización.
- Reglas de desempate y tratamiento de correcciones.
- Autenticación y visibilidad pública o privada de la clasificación.

---

**Liga Fitboxing Ourense** · Entrena, suma puntos y supera tus marcas. 🥊
