# Apura26

Painel da apuração das eleições de 2026 em colunas lado a lado, no estilo TweetDeck.
Cada coluna é o Brasil, um estado ou um município, com placar, tendências, evolução e marcos da apuração.

## Como os dados chegam

Os navegadores nunca consultam o TSE diretamente.
Um único poller (`supabase/functions/poll-tse`) roda a cada 5 segundos e faz requisições condicionais ao CDN de resultados do TSE.
Ele usa os índices de abrangência (`-ab.json`) para descobrir o que mudou e só baixa os resultados das disputas que alguém está acompanhando.
Os resultados ficam no Postgres (`results_latest` e `results_history`) e cada mudança é enviada aos navegadores via Supabase Realtime.
A função `watch` entrega o estado atual e o histórico quando uma coluna é aberta.

## Desenvolvimento

```sh
bun install
bun run dev
```

Outros comandos:

- `bun run test` roda os testes, que usam arquivos reais do TSE em `src/lib/election/__fixtures__/`.
- `bun run lint` roda o ESLint e o Prettier.
- `bun scripts/gen-places.ts` regenera a lista de lugares a partir da configuração do TSE.
