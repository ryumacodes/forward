import { intakeJsonSchema, type IntakeSource } from '../../../src/features/intake/schema.ts'

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok',{headers:cors})
  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    const {source,text} = await request.json() as {source:IntakeSource;text:string}
    if (!['voice_call','voice_note','email','sms','form'].includes(source) || !text?.trim() || text.length > 50_000) return json({error:'Send a valid source and up to 50,000 characters of text.'},400)
    const model = Deno.env.get('OPENAI_EXTRACTION_MODEL') || 'gpt-5.6-luna'
    const response = await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:'Extract procurement facts only from the supplied text. Do not infer unstated prices, dates, consent or commitments. Cite short evidence spans. Mark uncertain or missing fields.'}]},{role:'user',content:[{type:'input_text',text:`Source: ${source}\n\n${text}`}]}],text:{format:{type:'json_schema',name:'normalized_procurement_intake',strict:true,schema:intakeJsonSchema}}}),
    })
    if (!response.ok) return json({error:'Extraction provider failed',status:response.status},502)
    const body = await response.json()
    const output = body.output?.flatMap((item:{content?:unknown[]}) => item.content ?? []).find((item:{type?:string}) => item.type === 'output_text')?.text
    if (!output) return json({error:'No structured extraction returned'},502)
    return json({model,result:JSON.parse(output)})
  } catch (error) {
    return json({error:error instanceof Error ? error.message : 'Unable to normalize intake'},500)
  }
})

function json(value:unknown,status=200) { return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}}) }
