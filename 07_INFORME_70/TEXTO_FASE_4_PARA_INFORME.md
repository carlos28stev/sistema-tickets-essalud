# Fase 4: Arquitectura y diseño técnico

En esta fase se definió la arquitectura Serverless del sistema, empleando React y TypeScript para el frontend, Firebase Hosting para publicación, Firebase Authentication para identidad, Cloud Functions para la API y casos de uso, Cloud Firestore para persistencia NoSQL, Firebase Storage para archivos y un servicio NLP con motor de reglas de respaldo.

El backend fue organizado bajo Clean Architecture, separando dominio, aplicación, infraestructura e interfaces. Se diseñaron diez colecciones Firestore y se elaboró el diccionario de datos con tipos, restricciones y obligatoriedad.

Asimismo, se prepararon reglas de seguridad basadas en autenticación, estado activo y control de acceso por roles; nueve índices compuestos para los principales patrones de consulta; y una especificación OpenAPI con endpoints para tickets, usuarios, asignaciones, estados, comentarios, clasificación y reportes.
