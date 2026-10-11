export const producerSource = String.raw`self.onmessage=async({data:{file,sab,chunkSize}})=>{
 const control=new Int32Array(sab,0,16),bytes=new Uint8Array(sab,64);
 self.postMessage('ready');
 const reader=file.stream().getReader();let slot=0,fill=0;
 function waitEmpty(){let state=Atomics.load(control,slot);while(state!==0){if(Atomics.wait(control,slot,state,30000)==='timed-out')throw Error('Parser stopped consuming input');state=Atomics.load(control,slot);}}
 function publish(length,status){Atomics.store(control,2+slot,length);Atomics.store(control,slot,status);Atomics.notify(control,slot);}
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done){if(fill){publish(fill,1);slot=1-slot;fill=0;}waitEmpty();publish(0,2);break;}
   let position=0;
   while(position<value.length){
    if(fill===0)waitEmpty();
    const count=Math.min(chunkSize-fill,value.length-position);
    bytes.set(value.subarray(position,position+count),slot*chunkSize+fill);fill+=count;position+=count;
    if(fill===chunkSize){publish(fill,1);slot=1-slot;fill=0;}
   }
  }
 }catch(error){for(let i=0;i<2;i++){Atomics.store(control,i,3);Atomics.notify(control,i);}}
 finally{reader.releaseLock();self.close();}
};
`;
