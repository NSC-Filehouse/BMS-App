import React from 'react';

const businessDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

// Revalidate mounted option screens after midnight and when returning to the app.
export function useOptionValidityRefresh() {
  const [revision,setRevision] = React.useState(0);
  React.useEffect(()=>{
    let day=businessDate();
    const refresh=()=>{day=businessDate();setRevision(value=>value+1);};
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const timer=window.setInterval(()=>{if(day!==businessDate())refresh();},10000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',visible);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return revision;
}
