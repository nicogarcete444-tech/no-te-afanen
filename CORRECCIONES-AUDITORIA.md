# Correcciones de la auditoría

Esta copia incluye límites adicionales para el trabajo que una sola búsqueda o consulta de imágenes puede generar, lectura acotada de los cuerpos JSON, rechazo del rate limit sin configuración compartida en producción y validaciones SQL de tamaño/volumen para datos de carrito y ahorro.

## Para habilitar los controles de base de datos

Volvé a ejecutar `supabase/schema.sql` en el SQL Editor del proyecto Supabase. El archivo es repetible y crea/actualiza las funciones y triggers con `create or replace`/`drop trigger if exists`. Los controles SQL no entran en vigor hasta aplicar ese archivo en el proyecto.

## Alcance

Las correcciones están en el código fuente de este ZIP. No se aplicaron cambios a una instancia real de Supabase y no se desplegó la aplicación. No se corrieron build, lint ni pruebas en esta revisión.
