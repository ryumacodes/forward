export function completionSummary(input:{poNumber:string;supplierName:string;item:string;quantity:number;unit:string;totalCents:number;deliveryTime:string;paymentDays:number;depositBps:number}){
  const total=`AUD ${(input.totalCents/100).toFixed(2)}`
  return `SourcePilot issued purchase order ${input.poNumber} to ${input.supplierName} for the exact ${input.item} request: ${input.quantity} ${input.unit} for ${total}, quoted delivery ${input.deliveryTime}, payment in ${input.paymentDays} days, deposit ${input.depositBps/100}%. The purchase order was sent; supplier acceptance is still pending and no automatic payment was made.`
}
