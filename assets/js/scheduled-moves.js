(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RutasMoves=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function apply(rows,plan,now=new Date()){
    if(!plan||plan.schemaVersion!==1||!Array.isArray(plan.changes)||!Array.isArray(plan.supplementalCarriers))throw Error('Plan de traslados inválido');
    const instant=new Date(now).getTime();if(!Number.isFinite(instant))throw Error('Fecha de traslado inválida');
    const output=rows.map(t=>({...t,bodegas:t.bodegas.map(b=>({...b}))}));
    for(const carrier of plan.supplementalCarriers){if(!output.some(t=>t.id===carrier.id))output.push({...carrier,bodegas:carrier.bodegas.map(b=>({...b}))});}
    const processed=new Set();
    for(const change of plan.changes){
      const effective=Date.parse(change.effectiveAt),d=change.destination;
      if(!/T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(change.effectiveAt)||!Number.isFinite(effective)||!Array.isArray(change.targets)||!d||typeof d.direccion!=='string'||typeof d.zona!=='string'||!Number.isFinite(d.lat)||!Number.isFinite(d.lng)||d.lat<5||d.lat>11.5||d.lng< -88||d.lng> -82)throw Error('Cambio de ubicación inválido');
      for(const target of change.targets){
        const pair=JSON.stringify([target.carrierId,target.warehouseId]);if(processed.has(pair))throw Error('Traslados superpuestos para la misma bodega');processed.add(pair);
        const t=output.find(row=>row.id===target.carrierId);if(!t)throw Error('Transportista de traslado inexistente: '+target.carrierId);
        const b=t.bodegas.find(row=>row.id===target.warehouseId);if(!b)throw Error('Bodega de traslado inexistente: '+target.warehouseId);
        const active=instant>=effective;
        t.traslado={id:change.id,active,effectiveAt:change.effectiveAt,fecha:change.fechaVisible,destination:{...d},warehouseId:b.id};
        if(active){Object.assign(b,d);t.bodegas=[b,...t.bodegas.filter(other=>other.id!==b.id)];}
      }
    }
    return output;
  }
  return {apply};
});
