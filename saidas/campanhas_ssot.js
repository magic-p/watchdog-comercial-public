window.WATCHDOG_CAMPANHAS = {
  "campanhas": [
    {
      "id": "c001",
      "data": "2026-02-23",
      "canal": "WhatsApp",
      "executor": "Vitoria",
      "status": "final",
      "segmentos": [
        {
          "nome": "Caneca Renovação",
          "baldinho": "renovacao",
          "objetivo": "levantadas",
          "entregues": 329,
          "respondidas": 48,
          "levantadas": 27,
          "taxa_pct": 8.21,
          "custo": 177.66,
          "cpl": 6.58,
          "cliques": 24,
          "copy_resumo": "Lili aqui! Imagina seu time abrindo uma caixa. Dentro: caneca com foto deles transformada em aquarela pintada à mão. Nome da escola e frase especial. É isso que queremos dar pra você + cada professor. Precisa ser até quinta 26/02 17h.",
          "abordagem": "Lili pessoal + presente físico tangível + urgência"
        },
        {
          "nome": "Caneca Anos Anteriores",
          "baldinho": "anos_anteriores",
          "objetivo": "levantadas",
          "entregues": 102,
          "respondidas": 14,
          "levantadas": 6,
          "taxa_pct": 5.88,
          "custo": 55.08,
          "cpl": 9.18,
          "cliques": 4,
          "copy_resumo": "Lili aqui! Sua escola fez história conosco no passado. Imagina uma caixa chegando pra você + cada professor. Dentro: caneca com foto transformada em aquarela. Nome da escola e frase especial. Só até quinta 26/02 17h. Faz sentido matar a saudade?",
          "abordagem": "Lili pessoal + nostalgia + presente físico tangível + urgência"
        }
      ],
      "total_entregues": 431,
      "total_levantadas": 33,
      "taxa_geral_pct": 7.66,
      "custo_real": 232.74,
      "cpl_bruto": 7.05,
      "benchmark_cpl_historico": 48.6,
      "nota_qualitativa": "Melhor disparo de caneca do ciclo. Renovação 8,21% vs AA 5,88% — confirmando que Renovação responde mais ao mimo físico (insight003). CPL R$6,58 (Renovação) é o menor de toda a semana 23-27/02.",
      "gatilho_identificado": "mimo_fisico",
      "tags_padroes": [
        "caneca",
        "mimo_fisico",
        "renovacao",
        "anos_anteriores",
        "cpl_abaixo_benchmark"
      ],
      "aprendizados_vinculados": [
        "insight002",
        "insight003",
        "insight042"
      ],
      "observacoes": "Números finais do CSV v2 (26/02/2026). Atualizado de parcial para final."
    },
    {
      "id": "c002",
      "data": "2026-02-23",
      "canal": "WhatsApp",
      "executor": "Vitoria",
      "status": "final",
      "segmentos": [
        {
          "nome": "Retração Levantada",
          "baldinho": "retracao",
          "objetivo": "levantadas",
          "entregues": 351,
          "respondidas": 54,
          "levantadas": 12,
          "taxa_pct": 3.42,
          "custo": 189.54,
          "cpl": 15.8
        },
        {
          "nome": "Renovação LT Levantada",
          "baldinho": "renovacao_lt",
          "objetivo": "levantadas",
          "entregues": 518,
          "respondidas": 86,
          "levantadas": 19,
          "taxa_pct": 3.67,
          "custo": 279.72,
          "cpl": 14.72
        },
        {
          "nome": "Lista Todos menos renovação",
          "baldinho": "todos",
          "objetivo": "envio_de_lista",
          "entregues": 84,
          "respondidas": 9,
          "levantadas": 3,
          "taxa_pct": 3.57,
          "custo": 45.36,
          "cpl": 15.12,
          "nota": "Objetivo: conversão de fechada para envio de lista."
        },
        {
          "nome": "Outbound Playlist",
          "baldinho": "outbound",
          "objetivo": "levantadas",
          "entregues": 1336,
          "respondidas": 270,
          "levantadas": 2,
          "taxa_pct": 0.15,
          "custo": 721.44,
          "cpl": 360.72,
          "cliques": 18,
          "nota": "ALERTA: CPL R$360,72 = 7,4x benchmark. Copy emocional/playlist gera curiosidade (cliques 1,35%) mas não levantadas (0,15%). Ver alerta018 e insight043."
        }
      ],
      "total_entregues": 2289,
      "total_levantadas": 36,
      "taxa_geral_pct": 1.57,
      "custo_real": 1236.06,
      "cpl_bruto": 34.33,
      "cpl_excluindo_outbound": 15.36,
      "benchmark_cpl_historico": 48.6,
      "nota_qualitativa": "Disparo de levantadas 23/02. CPL agregado R$34,33 puxa pela tragédia do Outbound (CPL R$360,72). Sem Outbound: CPL R$15,36 — excelente. Outbound playlist precisa de nova copy antes de qualquer próximo ciclo.",
      "gatilho_identificado": null,
      "tags_padroes": [
        "levantadas",
        "retracao",
        "renovacao",
        "outbound",
        "outbound_playlist_fail",
        "cpl_abaixo_benchmark"
      ],
      "alertas_vinculados": [
        "alerta018"
      ],
      "aprendizados_vinculados": [
        "insight043"
      ],
      "observacoes": "Números finais do CSV v2 (26/02/2026). Data corrigida: era 2026-02-27 incorreto."
    },
    {
      "id": "c003",
      "data": "2026-02-25",
      "canal": "WhatsApp",
      "executor": "Vitoria",
      "status": "final",
      "segmentos": [
        {
          "nome": "Caneca Reforço — AA Descarte (consolidado final)",
          "baldinho": "anos_anteriores",
          "objetivo": "levantadas",
          "entregues": 953,
          "levantadas": 25,
          "taxa_pct": 2.62,
          "custo": 514.62,
          "cpl": 20.58,
          "nota": "25 levantadas, sendo 23 de descarte e 2 de outras etapas. ATENÇÃO: 6/25 (24%) são registros 'Duplicada' na base — levantadas únicas reais estimadas: 19. CPL ajustado: R$27,09. Limpeza de duplicatas pendente (t030 — Vitória).",
          "breakdown_descarte": {
            "nao_tem_interesse": 6,
            "duplicada": 6,
            "fim_de_cadencia": 3,
            "na": 2,
            "aplica_projeto_similar": 2,
            "so_proximo_ano": 1,
            "so_2_semestre": 1,
            "nao_quer_receber_comunicacao": 1,
            "inicio_ano_letivo_2026": 1,
            "esta_com_muitos_projetos": 1,
            "escola_fechada_nao_existe": 1,
            "total": 25
          },
          "abordagem": "mimo físico (caneca aquarela) + urgência + condicionamento à adesão"
        },
        {
          "nome": "Caneca Reforço — Renovação",
          "baldinho": "renovacao",
          "objetivo": "levantadas",
          "entregues": 314,
          "levantadas": 15,
          "taxa_pct": 4.78,
          "custo": 169.56,
          "cpl": 11.3,
          "nota": "Segundo disparo para base renovação (primeira ação em 23/02 teve 8,21%). Queda esperada — diminishing returns no reforço. Ainda acima do benchmark verde (2,0%).",
          "abordagem": "reforço de urgência + caneca como benefício condicional à adesão"
        },
        {
          "nome": "FUP Fechada→Convertida (sem nome no CSV)",
          "baldinho": "todos",
          "objetivo": "envio_de_lista",
          "entregues": 280,
          "levantadas": null,
          "taxa_pct": null,
          "custo": 151.2,
          "nota": "Linha sem nome no CSV. Provavelmente t020 (disparo FUP fechada→convertida) ou t024 (Novas voucher R$100), ambos marcados como concluídos em 25/02. Resultado de conversão não registrado no CSV. Vitória deve nomear e atualizar (t031)."
        }
      ],
      "total_entregues": 1547,
      "total_levantadas": 40,
      "total_levantadas_ajustado_duplicatas": 34,
      "taxa_geral_pct": 2.59,
      "custo_real": 835.38,
      "cpl_bruto": 20.88,
      "cpl_ajustado_duplicatas": 24.57,
      "benchmark_cpl_historico": 48.6,
      "nota_qualitativa": "MELHOR CPL DO CICLO. Caneca descarte AA comprova que base de rejeição tem interesse latente real — 2,62% de levantadas em base de descarte, acima do benchmark verde (2,0%). 'Não tem interesse' (24% das levantadas) sugere que o label está sendo aplicado prematuramente ou que o gatilho de mimo supera a resistência. 6 duplicatas (24%) inflam o número — limpeza necessária antes do próximo ciclo.",
      "gatilho_identificado": "mimo_fisico",
      "tags_padroes": [
        "caneca",
        "AA_descarte",
        "reforco",
        "mimo_fisico",
        "cpl_abaixo_benchmark",
        "nao_interesse_responde",
        "duplicatas_na_base"
      ],
      "aprendizados_vinculados": [
        "insight025",
        "insight026",
        "insight027",
        "insight030",
        "insight038",
        "insight039",
        "insight040",
        "insight041"
      ],
      "alertas_vinculados": [
        "alerta012",
        "alerta013",
        "alerta017"
      ],
      "booked_revenue_associado": null,
      "observacoes": "Fechamento final 25/02 — Vitória Riente. Comparação: c001 caneca 23/02 = 33 levantadas / 431 entregues (7,66%). c003 reforço/descarte = 40 levantadas / 1.267 entregues (3,16%). Volume 2,4x maior com taxa menor — padrão esperado de reforço + base mais difícil. Budget restante do ciclo: R$624,92."
    },
    {
      "id": "c004",
      "data": "2026-02-24",
      "canal": "WhatsApp",
      "executor": "Vitoria",
      "status": "final",
      "tipo": "teste_ab",
      "segmentos": [
        {
          "nome": "Concorrência A/B — copy playlist",
          "baldinho": "concorrencia",
          "variante": "A",
          "objetivo": "levantadas",
          "entregues": 289,
          "levantadas": 4,
          "taxa_pct": 1.38,
          "custo": 156.06,
          "cpl": 39.02,
          "copy_resumo": "abordagem emocional/experiência de produto com playlist",
          "resultado_ab": "perdedor"
        },
        {
          "nome": "Concorrência A/B — copy concorrência direta",
          "baldinho": "concorrencia",
          "variante": "B",
          "objetivo": "levantadas",
          "entregues": 289,
          "levantadas": 7,
          "taxa_pct": 2.42,
          "custo": 156.06,
          "cpl": 22.29,
          "copy_resumo": "posicionamento direto de diferencial vs concorrente",
          "resultado_ab": "vencedor"
        }
      ],
      "total_entregues": 578,
      "total_levantadas": 11,
      "taxa_geral_pct": 1.9,
      "custo_real": 312.12,
      "cpl_bruto": 28.37,
      "benchmark_cpl_historico": 48.6,
      "vencedor_ab": "copy_concorrencia_direta",
      "margem_vencedor": "75% melhor em taxa, 43% melhor em CPL",
      "nota_qualitativa": "Primeiro A/B controlado de copy para segmento Concorrência. Resultado definitivo: posicionamento competitivo supera apelo emocional. Adotar copy B como padrão.",
      "gatilho_identificado": "diferenciacao_competitiva",
      "tags_padroes": [
        "concorrencia",
        "teste_ab",
        "copy_concorrencia_direta",
        "cpl_abaixo_benchmark"
      ],
      "aprendizados_vinculados": [
        "insight042"
      ],
      "observacoes": "Números finais do CSV v2 (26/02/2026). Bases idênticas (289 entregues), mesmo budget — teste limpo."
    },
    {
      "id": "c005",
      "data": "2026-02-25",
      "hora": "13h30",
      "canal": "WhatsApp",
      "executor": "Vitoria",
      "status": "final",
      "tipo": "ativacao_bolsao",
      "objetivo_principal": "envio_de_lista",
      "segmentos": [
        {
          "nome": "Vale Presente — Outbound",
          "baldinho": "outbound",
          "entregues": 37,
          "levantadas": 2,
          "taxa_pct": 5.41,
          "custo": 19.98,
          "cpl": 9.99
        },
        {
          "nome": "Vale Presente — Retração",
          "baldinho": "retracao",
          "entregues": 41,
          "levantadas": 0,
          "taxa_pct": 0.0,
          "custo": 22.14,
          "cpl": null
        },
        {
          "nome": "Vale Presente — Concorrência",
          "baldinho": "concorrencia",
          "entregues": 39,
          "levantadas": 0,
          "taxa_pct": 0.0,
          "custo": 21.06,
          "cpl": null
        },
        {
          "nome": "Vale Presente — Anos Anteriores",
          "baldinho": "anos_anteriores",
          "entregues": 103,
          "levantadas": 1,
          "taxa_pct": 0.97,
          "custo": 55.62,
          "cpl": 55.62
        }
      ],
      "total_entregues": 220,
      "total_levantadas": 3,
      "taxa_geral_pct": 1.36,
      "custo_real": 118.8,
      "nota_qualitativa": "Vale presente funciona para Outbound (escolas frias: 5,41%) mas zero para Retração e Concorrência. Barreira nesses segmentos é de confiança, não de custo. Amostra pequena mas padrão coerente.",
      "gatilho_identificado": "beneficio_financeiro",
      "tags_padroes": [
        "vale_presente",
        "ativacao_bolsao",
        "outbound",
        "retracao",
        "concorrencia"
      ],
      "aprendizados_vinculados": [
        "insight044"
      ],
      "observacoes": "Números finais do CSV v2 (26/02/2026)."
    },
    {
      "id": "c006",
      "data": "2026-02-26",
      "nome": "Ativacao LT 1-a-1 como Lili — WhatsApp pessoal renovacao",
      "canal": "WhatsApp manual (1-a-1)",
      "segmento": "Renovacao LT (Low Touch)",
      "tipo": "ativacao_bolsao",
      "base": 24,
      "status": "parcial",
      "mecanica": "Kaka enviou mensagem individualmente para cada escola como se fosse a Lili (cofundadora). Nao foi disparo automatizado.",
      "copy_usada": "Sou a Lili, cofundadora da Estante Mágica. A [Nome da Escola] já está confirmada no projeto — e mal posso esperar pelo dia em que cada aluno de vocês segurar o próprio livro na noite de autógrafos. 🌟 Falta só a lista de alunos para darmos seguimento. Me manda do jeito que estiver: Excel, PDF ou foto. Eu mesma faço o cadastro com carinho. Consigo receber hoje?",
      "resultados_parciais": {
        "listas_recebidas": 7,
        "promessas_amanha": 2,
        "total_positivo": 9,
        "taxa_conversao_preliminar": 0.375,
        "data_medicao": "2026-02-26"
      },
      "nota_qualitativa": "Resultado mais alto de ativacao de bolsao registrado. Combinacao de personalizacao extrema (como a Lili) + copy emocional (noite de autografos) + pedido low friction (qualquer formato) = friccao minima para a escola.",
      "gatilho_identificado": "autoridade_cofundadora + emocao_noite_autografos + low_friction_pedido",
      "tags_padroes": [
        "1-a-1",
        "personalizacao_extrema",
        "como_lili",
        "low_friction",
        "bolsao_ativacao",
        "renovacao_lt"
      ],
      "aprendizados": [
        "insight053"
      ]
    }
  ],
  "insights": [
    "Melhor taxa: Caneca Renovação com 8.2% via WhatsApp em 2026-02-23",
    "Menor taxa: Outbound Playlist com 0.1% — revisar abordagem ou qualidade da lista",
    "Caneca: Caneca Renovação converteu 1.4x mais que Caneca Anos Anteriores com copy similar — audiencia mais responsiva"
  ],
  "updated": "2026-02-26T15:55:04.945962"
};
