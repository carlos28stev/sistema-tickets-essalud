# Estructura técnica propuesta

```text
05_CODIGO_FUENTE/
├── frontend/
│   └── src/
│       ├── modules/
│       │   ├── auth/
│       │   ├── tickets/
│       │   ├── users/
│       │   ├── reports/
│       │   └── configuration/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── routes/
│       └── types/
│
├── functions/
│   └── src/
│       ├── domain/
│       │   ├── entities/
│       │   └── repositories/
│       ├── application/
│       │   ├── use-cases/
│       │   └── dto/
│       ├── infrastructure/
│       │   ├── firestore/
│       │   └── nlp/
│       └── interfaces/
│           └── http/
│
└── firebase/
    ├── firestore.rules
    └── firestore.indexes.json
```
