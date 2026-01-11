# Operations Processing Service - Arquitetura e Decisões

## A. Abordagem Escolhida

**Event Sourcing** para auditoria completa e processamento assíncrono de operações financeiras.

### Componentes

- **Event Store** (`operation_events`): Armazena eventos imutáveis, deduplicação por `(external_id, event_type, payload_hash)`
- **State Machine**: Transições controladas `PENDING → PROCESSING → COMPLETED/REJECTED`
- **State Projection** (`operations`): Tabela com estado atual para leitura rápida
- **BullMQ + Redis**: Processamento assíncrono com workers e retry automático
- **Pessimistic Locking**: `SELECT FOR UPDATE` garante ordem e previne race conditions

### Fluxo

```
API recebe → Armazena evento → Enfileira job → Worker processa com lock → Atualiza estado → Commit
```

## B. Trade-offs

### Event Sourcing vs CRUD

**Escolhido**: Event Sourcing

- ✅ Auditoria completa, replay, suporte a eventos fora de ordem
- ❌ Maior complexidade, duas tabelas, mais storage

### Pessimistic vs Optimistic Locking

**Escolhido**: Pessimistic Locking

- ✅ Garante ordem, previne race conditions, consistência forte
- ❌ Possível contenção, locks longos, degradação sob alta concorrência

### Assíncrono vs Síncrono

**Escolhido**: Assíncrono (202 Accepted)

- ✅ API rápida, desacoplamento, escalabilidade de workers
- ❌ Cliente precisa consultar status, eventual consistency

## C. Escala e Falhas

### Escalabilidade

**Horizontal**:

- API: Stateless, escala horizontalmente
- Workers: Múltiplos workers em paralelo (limitado por locks por `external_id`)
- Database: Read replicas para leitura, master para escrita
- Redis: Redis Sentinel ou Cluster para High Availability (failover automático em caso de falha, evitando SPOF). Locks distribuídos via Redis (SETNX) para reduzir contenção de locks pessimistas no PostgreSQL, permitindo maior paralelismo entre workers

**Limites Atuais**:

- API: ~1000 req/s por instância
- Workers: ~500 ops/s (limitado por transações e locks)
- Bottlenecks: Locks pessimistas, single DB instance, sem cache

**Melhorias Futuras**:

- Cache Redis para leituras frequentes
- Locks distribuídos (Redis) para reduzir contenção de locks pessimistas no PostgreSQL
- Particionamento de filas por hash de `external_id`
- Archive de eventos antigos

### Tolerância a Falhas

**Falhas Transientes**:

- BullMQ retry automático (exponential backoff)
- Connection pooling com retry
- Circuit breaker (recomendado)

**Falhas Persistentes**:

- Event Sourcing permite reconstrução completa
- Backups automáticos com PITR (recomendado)
- Failover automático (Redis Sentinel para High Availability, DB replicas)

**Idempotência e Consistência**:

- Deduplicação por hash previne processamento duplicado
- Transações ACID garantem atomicidade
- Lock pessimista previne race conditions
- Eventual consistency entre API e Worker (cliente faz polling/webhooks)

### Monitoramento

- Métricas: latência (P50/P95/P99), taxa de erro, tamanho da fila
- Alertas: fila crescendo, taxa de erro > 1%, latência alta, DB/Redis indisponível

**Conclusão**: Arquitetura prioriza consistência e auditabilidade sobre performance máxima, adequada para operações financeiras. Com melhorias recomendadas, pode escalar **10x-100x** mantendo garantias de consistência.
